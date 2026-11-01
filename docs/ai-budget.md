# AI-budget en meting (#79)

Workers AI geeft 10.000 gratis neuronen per **UTC-dag** (reset 00:00 UTC, in de winter 01:00 en in de zomer 02:00 Amsterdamse tijd). Wij houden een eigen teller bij met plafond `BUDGET` (9000). Dit document beschrijft wat die teller meet, wat hij mist en hoe een quotafout wordt herkend. Gedrag per trap (70/90/100%): zie [architectuur](architectuur.md#workers-ai-en-budget).

## Hoe er gemeten wordt

Pure logica in `src/budget.ts` (ook geëxporteerd door `worker/src/budget.ts`), getest in `tests/budget-meting.test.ts`.

- **Per aanroep** (`meetChat`): `r.usage.neurons` als Workers AI die meldt; anders `prompt_tokens`/`completion_tokens` × tarief (`RATES` in `worker/src/ai.ts`); ontbreken ook de tokens, dan 3,5 tekens per token. Elke aanroep zonder echte `usage.neurons` telt in `geschat`, zodat zichtbaar is hoeveel van de teller een schatting is.
- **Mislukte aanroep** (`meetFout`): een fout kan toch neuronen kosten. Geteld wordt de invoer volledig en de uitvoer als de helft van `max_tokens`. Een afgewezen aanroep (dagquota of tijdelijke fout) kost alleen invoer. Deze neuronen staan ook apart in `foutN`. De fout wordt doorgegooid; de aanroeper handelt hem af.
- **Per run** (`uur` → `meta`): `neuronenRun`, `tokensRun {in, uit}`, `aiCalls`, `aiFouten` (+ `aiFoutenAanroep`, `aiFoutenOutput`, `aiLaatsteFout`, `aiTerugval`, `aiTerugvalGroq`, `groqTokensVandaag`), `aiGeschat`, `neuronenFoutRun`, `aiTijdelijk`, `quotaReden` (`null`, `budget` of `dagquota`), `neuronFactor`, `budgetDag` (UTC-dag) en `dag {neuronen, calls, tokensIn, tokensUit, geschat, neuronenFout}`. Bestaande velden (`neuronenVandaag`, `neuronenVideo`, `quotaOp`) blijven.
- **AI-fouten (#431)**: `aiFouten` is de som van `aiFoutenAanroep` (aanroep of keten mislukt: exception, HTTP-fout, keten uitgeput) en `aiFoutenOutput` (antwoord ontvangen maar leeg, geen geldige JSON of nul bruikbare items). Het zijn fouten per stap (een groep berichten, de dagtekst, het weer), niet per providerverzoek; `aiCalls` telt gemeten Cloudflare-aanroepen en geslaagde externe aanroepen. `/status` toont alle velden (het leest `uur.meta`). Bij een externe fout logt de Worker aanbieder, model en HTTP-status of een vaste foutcategorie, zonder verzoekgegevens.
- `aiLaatsteFout` `{soort: "aanroep"|"output", bericht, tijd, bron?: "cloudflare"|"groq"|"mistral"}`: de laatste fout van de run, of `null`. Het bericht is kort (max 160 tekens) en opgeschoond (`schoonBericht` in `worker/src/ai.ts`: geen URL's of querystrings, sleutels of lange tokens); nooit prompt, artikeltekst of headers.
- **Terugval**: geeft Cloudflare bij `summarize` of `verdiep` een leeg of onbruikbaar antwoord, dan volgt precies één nieuwe poging via de bestaande externe keten (Groq eerst, daarna Mistral als die is ingesteld), alleen als daar nog ruimte is binnen de limieten (o.a. 200.000 tokens per dag per Groq-model). Geen extra Cloudflare-aanroep en geen lus. `aiTerugval` telt de pogingen (ook een leeg Cloudflare-antwoord dat `chat` zelf naar de keten doorzet), `aiTerugvalGroq` de geslaagde via Groq. Mislukt de poging ook, dan telt dat als `aiFoutenOutput` (of `aiFoutenAanroep` als de keten zelf faalt) en gaat de run door.
- **Groq-dagtotaal**: Worker (`state.llm["groq:<model>"]`) en Function (`groq-chat:<UTC-dag>`) houden elk een stand bij. Elke keten start met de som van beide en schrijft daarna alleen het verschil terug bij een verse lezing (`somStand`/`verschilStand`/`telOp` in `worker/src/llm.ts`), zodat de limiet per model over beide telt en gelijktijdige Function-verzoeken elkaars stand niet overschrijven (in-isolate seriële lees-schrijfstap; tussen isolates blijft een race van enkele milliseconden mogelijk). De Worker schrijft zijn verbruik ook bij als de run halverwege faalt of `state` niet wegschrijft. `groqTokensVandaag` in de run-meta is de som over modellen en beide bronnen, gelezen uit KV.
- **`vid-neurons`**: de Budget-DO is leidend; de KV-spiegel wordt bij een mislukte schrijfactie bij de volgende aanroep (ook `stand`) hersteld, de Function probeert een mislukte verrekening één keer opnieuw, en de KV-terugval (zonder binding) serialiseert lezen-en-schrijven per isolate. De uur-Worker leest de spiegel bij de start en ververst hem vóór de AI-uitleg.
- **Per dag** (KV `state`): `neurons`, `calls`, `inTok`, `outTok`, `geschat`, `foutN`, met `neuronDag` (UTC-datum). Video: KV `vid-neurons:<UTC-dag>` (gespiegeld uit de Durable Object `Budget`).

## UTC-dag

De teller (`state.neurons`, `vid-neurons:<dag>`, de dagsleutels van de `Budget`-DO) loopt op `utcDag()`. De cache van samenvattingen in `state` blijft op de Amsterdamse dag (zoals #56); alleen de teller heeft een eigen `neuronDag`. Bij een nieuwe Amsterdamse dag blijft de teller staan zolang de UTC-dag gelijk is (tussen 00:00 en 01:00/02:00 Amsterdamse tijd is de oude UTC-dag nog actief); `zetDagTeller` nult hem pas bij een nieuwe UTC-dag. Een oude `state` zonder `neuronDag` telt als `datum`. De Amsterdamse datum blijft voor weergave, het dagfilter en de uurrem (`vs-uur:`).

## Veiligheidsfactor

Env `NEURON_FACTOR` (optioneel, standaard 1, begrensd op 0,5–5; niet in `wrangler.toml`) deelt het budget: effectief budget = `BUDGET / NEURON_FACTOR`. Met 1,25 stopt AI bij 7200 eigen neuronen in plaats van 9000. De factor geldt in de Worker (run en alarm) en in `functions/samenvatting.ts`. Instellen kan alleen door Joey (dashboard of `wrangler secret`/vars); dat valt onder de deploygoedkeuring.

## Quotafout herkennen

`aiFout(e)` geeft `dagquota`, `tijdelijk` of `overig`.

| Soort | Herkenning | Gevolg |
|---|---|---|
| `dagquota` | code `4006`, "daily free allocation", "used up your daily…", neuronen + daily/exceed | `quotaOut` voor de rest van de UTC-dag; KV-vlag `ai-quota:<UTC-dag>` (TTL 2 dagen) zodat Worker én Function stoppen; `/samenvatting` meldt "dagruimte op" |
| `tijdelijk` | 429, rate limit, capacity (3040), overloaded, time-out | alleen de rest van déze run geen AI (Worker, fallback `ruw`) of een 503 zonder cache (Function); volgende run probeert het opnieuw |
| `overig` | de rest | telt als mislukt (`aiFoutenAanroep`); Function cachet de fout 30 minuten |

Eerder gold elke fout met "limit", "429", "quota", "neuron" of "exceed" als dagquota; één tijdelijke 429 zette dus de hele dag AI uit.

## Alle plekken die Workers AI aanroepen

Alleen `env.AI.run` telt; vier onderdelen praten er rechtstreeks mee.

| Plek | Model | Meting | Opmerkingen |
|---|---|---|---|
| `worker/src/ai.ts` `chat()` (via `summarize`, `inHetKort`, `simpelWeer`, `verdiep`; aangeroepen vanuit `worker/src/index.ts`) | gemma-4-26b of llama-3.2-1b | `usage` → `state` + `meta` | succes én fout geteld sinds #79 |
| `functions/samenvatting.ts` `chat()` (video-punten) | idem | `u` → `vid-neurons:<UTC-dag>` via DO | succes én fout geteld sinds #79 |
| `functions/samenvatting.ts` Whisper (`whisper-large-v3-turbo`) | Whisper | duur × 46,64 neuronen/min; vooraf gereserveerd, achteraf verrekend | geen `usage` in de respons; duur uit `transcription_info`, anders schatting (`geschat`) |
| `worker/src/vooraf.ts` | geen eigen AI | roept `/samenvatting` met `pre:true` aan; neuronen komen uit het antwoord (`neuronen`) en dit is alleen een lokale rem per alarm | telt dus via de Function, niet dubbel |

Geen andere gebruikers van `env.AI` (`functions/meer.ts`, `data.json.ts` en de proxy gebruiken geen AI).

## Wat de teller nog steeds mist of onderschat (bevindingen)

1. **Verbruik buiten deze code.** Andere Workers of apps op hetzelfde account, het dashboard (Playground), AI Gateway of `wrangler dev` met remote AI (`npx wrangler dev` kost echte neuronen) delen hetzelfde dagquotum maar staan nergens in onze teller. Dit kan een deel van het verschil op 30-10 ±12:01 verklaren (±3.700 geschat tegen een vol quotum).
2. **De 3,5-tekens-per-token-schatting.** Zonder `usage.tokens` wordt de invoer onderschat bij Nederlandse tekst, JSON, getallen en URL's (vaak 2,5–3 tekens per token). Of `r.usage.neurons` echt voorkomt is niet bevestigd (geen echte aanroepen gedaan); is dat niet zo, dan is bijna elke aanroep een schatting. Check `meta.aiGeschat` tegenover `aiCalls`.
3. **Tarieven in `RATES`** staan hard in de code (en nogmaals, deels onvolledig, in `functions/samenvatting.ts`); een onbekend model valt terug op 10.000/30.000 per miljoen tokens. Wijzigt Cloudflare tarieven, dan loopt de teller scheef.
4. **Mislukte of afgebroken aanroepen** kosten mogelijk meer dan de schatting (half `max_tokens` aan uitvoer); een gegooide fout geeft geen `usage`. Sinds #79 geschat meegeteld, maar niet exact.
5. **Whisper:** de duurschatting zonder `transcription_info` (`bytes / 1,2 MB` per minuut voor mp4) en het aannemen van 46,64 neuronen/min kunnen afwijken; `vad_filter` verandert mogelijk wat Cloudflare factureert. Een Whisper-aanroep die faalt houdt de vooraf gemaakte reservering (de schatting) in `vid-neurons`; een gefaalde YouTube-ondertitelketen kost niets (geen AI).
6. **Worker schrijft de dagteller pas aan het einde van de run** (`st.neurons += usage.neurons` vlak vóór `schrijfRun`). Faalt de run daarvoor (exception, time-out, KV-fout op `state`), dan zijn de neuronen van die run kwijt, terwijl de AI-aanroepen wel gebeurd zijn. Open punt: de teller in de DO of per groep wegschrijven.
7. **Gelijktijdigheid:** de Worker leest `vid-neurons` één keer aan het begin van de run (`vidN`); video-verbruik tijdens de run telt pas in de volgende. Ook de reservering van `/samenvatting` kent het nieuwsverbruik van de lopende run niet. De `reserve` (260 per resterend uur) en de `PRE_MARGE` vangen dat deels op.
8. **Retries:** onze code doet zelf geen AI-retries. Cloudflare kan intern herhalen zonder dat wij het zien; dat staat dan alleen in de echte teller.
9. **Uurrem:** de rem van 30 Whisper-aanroepen per uur is een aantal, geen neuronen; het neuronbudget bewaakt de reservering vooraf.

## Controleren

1. Vergelijk `meta.dag.neuronen + meta.neuronenVideo` met de teller in het Cloudflare-dashboard (Workers AI) op hetzelfde UTC-tijdstip.
2. Is het verschil structureel groter dan 0%, stel dan `NEURON_FACTOR` in op (dashboard ÷ onze teller), bijvoorbeeld 1,3.
3. Staat `meta.quotaReden` op `dagquota`, dan zit er een KV-vlag `ai-quota:<UTC-dag>`; hij verloopt vanzelf en een nieuwe UTC-dag gebruikt een nieuwe sleutel.

## Samenvattingen per tab (#134)

Na de gewone berichtsamenvattingen gebruikt Home de bestaande briefing. Voor elke andere nieuwstab gebruikt de Worker maximaal tien berichten, met per bericht een korte kop en tekst. Een succesvolle AI-tekst blijft bij gewijzigde inhoud minstens zes uur staan; ongewijzigde inhoud blijft tot zeven dagen in de cache. Bij trap 3 of 4, quota of een vol runbudget gaat de keten via Groq en Mistral; zonder beschikbare aanbieder volgt extractieve tekst. Tijdelijke fouten stoppen AI voor de run. De bestaande `usage`, `state` en `meta` tellen het verbruik mee.

Schatting: 24 uurruns per dag, acht rubrieken met artikelen, gemiddeld 600 invoer- en 100 uitvoertokens per aanroep en gemiddeld vier vernieuwingen per rubriek per dag (bij ongewijzigd nieuws minder). Dat zijn 32 aanroepen per dag, gemiddeld 1,33 per run. Met het hoofdmodel en de tarieven uit `RATES` (9.091 en 27.273 neuronen per miljoen invoer- en uitvoertokens) is dat circa 8,2 neuronen per run en 262 per dag. Met het kleine model (2.457 en 18.252) is dat circa 4,4 per run en 106 per dag. Als alle aanroepen via Groq of Mistral gaan, zijn dat gemiddeld 800 invoer- en 133 uitvoertokens per run, oftewel 19.200 en 3.200 per dag. Dit is een schatting, geen harde grens: cacheverval, fouten, tokengebruik en wisselende tabs kunnen de uitkomst veranderen.

## Nieuwsstijl van kop en samenvatting (#427)

De prompt van `summarize` in `worker/src/ai.ts` vraagt per bericht twee velden in nieuwsstijl, zonder extra aanroepen of extra neuronen:

- **`kop`**: wie/wat/waar met de kern van het nieuws, concreet en feitelijk.
- **`ai`**: één à twee zinnen met de kern, met data, plaatsen en namen uit de bron behouden. Geen opvulzinnen en geen interpretatie of duiding die niet in de bron staat. Afkortingen blijven neutraal (niet uitgeschreven of aangevuld op eigen gezag).

## Aandeel per run, run-slot en alarmteller (#451)

- **Tijdsgebaseerd aandeel**: `runsLeft` komt uit `worker/src/runslot.ts`, niet meer uit het uur. Interval = werkelijke tijd sinds de start van de vorige geplande run (DO-opslag `vorigeRunStart`), afgerond op 5 minuten, begrensd op 5..60; onbekend = 60. `runsLeft = max(1, minuten van het huidige slot tot 24:00 Amsterdam / interval)`. Bij interval 60 is dat exact `23 - uur + 1`, dus uurlijks draaien rekent hetzelfde als voorheen. `runBudget` en `diepRun` houden hun formules (factor 2, max 700); de ondergrenzen 300 en 120 schalen mee met `interval / 60` (bij 60 ongewijzigd), anders kan een cron van 5 minuten met alleen de ondergrens het dagbudget in de ochtend opmaken. Een handmatige `force`-run hergebruikt het laatst gemeten interval en verschuift de meting niet. `meta` bevat `runInterval` en `runsLeft`.
- **Run-slot**: `Runner.fetch` reserveert `runSlot` (starttijd) in DO-opslag. Is het slot jonger dan 10 minuten, dan volgt 409 `{ ok:false, overgeslagen:"vorige run nog bezig" }`; dat telt niet als mislukte run (geen `run-status`, geen `faalReeks`) en `scheduled()` logt het met `console.log`. Een ouder slot geldt als crash en wordt overgenomen. Het slot wordt in `finally` vrijgegeven. De force-regel (`laatsteRun`, 10 minuten, 429) is ongewijzigd.
- **Alarmteller per uur**: `vooraf = { uur, n }` wordt alleen gereset als het Amsterdamse uur verandert, en een nieuw alarm wordt alleen gezet als er geen eerder of gelijk alarm gepland staat. `MAX_ALARMS_PER_UUR` (3) geldt dus per uur, ook bij runs elke 5 minuten. De alarmformule blijft per uur.
