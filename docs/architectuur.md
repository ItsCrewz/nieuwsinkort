# Architectuur

Video-samenvattingen gebruiken met de Pages-secret `GROQ_API_KEY` Groq Whisper en de Groq-chatketen. Audio boven 25 MB en mislukte of begrensde Groq-verzoeken vallen terug op Cloudflare binnen het bestaande budget. KV houdt UTC-dagtellers en minuut- en uurvensters bij; KV is niet atomair, waardoor gelijktijdige verzoeken de limieten kunnen overschrijden. Groq-gebruik telt niet mee in video-neuronen.


Alles draait op Cloudflare (Free plan). Geen eigen server.

```
 bronnen (RSS, hnrss, X, YouTube, Instagram, Dumpert, Reddit/Redlib, weer)
        │  elk uur 06–23 (Amsterdam)
        ▼
 Worker nieuwsinkort-uur ── DO Fetcher (ophalen in batches)
   DO Runner (run, budget, state) ── Workers AI → Groq → Mistral (tekst-AI)
   DO Budget (slot, video-neuronen, uurrem van /samenvatting; Pages roept deze aan via BUDGET_DO)
        │ schrijft
        ▼
   KV NIEUWS: uur, meer, sv-klaar, vs:<id>, vooraf-log, state, og:<genormaliseerde-url>, vid-neurons:<datum> (gedeeld AI-budget)
        │ leest
        ▼
 Pages Functions: /data.json (merge KV uur + statische data.json)
                  /samenvatting, /meer, /media/dumpert/*
        ▼
 Frontend (React, hls.js) op nieuwsinkort.pages.dev
```

Oude flow (nog aanwezig): routine → Grok-canvas → `export_from_canvas.mjs` → `public/data.json` → `deploy.sh` → statisch `dist/data.json`. De Worker vult die data elk uur aan.

## Frontend (`src/`)

Vite 8, React 18, TypeScript, Tailwind 3, hls.js. Mobiele feed in TikTok-stijl met fotocarrousels, filters (tijd, rubriek, regio, video, samengevoegd, volgorde), Bronnen-paneel, en een videofeed die alleen op touch verschijnt (`src/invoer.ts`: `(pointer: coarse)` of `(hover: none)`, reageert op wijzigingen; desktop toont de kaarten met kopjes en opent een filmpje bij de bron) (max 2 spelers tegelijk, frame-waakhond die op hetzelfde element herstelt bij 2,5 s zonder nieuw beeld, geluid standaard aan via localStorage). Video: YouTube via nocookie-iframe, HLS native of via hls.js, MP4 via `<video>` (met `referrer=no-referrer` voor video.twimg.com). Ontdubbelen van video's en foto's: `dedup.ts`, `beeld.ts`. Het bouwen draait eerst `scripts/build-bronnen.mjs` (`public/bronnen.json`).

Video's worden naast platform-ID, media, URL, thumbnail en titel ook gekoppeld op een letterlijk gedeeld begin van de genormaliseerde caption of titel met beschrijving: minstens 80 tekens en acht verschillende inhoudswoorden, binnen drie uur. Bij twee publicatietijdstippen geldt hun werkelijke verschil; anders zijn twee geldige `tijd`-velden nodig. De beste kopie blijft staan en andere bronnen komen in `ook`. Gelijk onderwerp of afwijkende tekst is onvoldoende: de JA21-reel en het SGP-journaal blijven bijvoorbeeld apart. Een lange gedeelde standaardtekst kan nog steeds verschillende video's samenvoegen.

Video (#44): `src/stall.ts` bewaakt elke 300 ms de afspeeltijd. Na 600 ms stilstand bevriest de balk; bij beweging of meer dan 0,3 s afwijking wordt hij gelijkgezet. Bij minstens 1 s buffer vooruit of readyState 3 volgt na 3 s een herstelpoging; zonder data pas na 10 s. Na nog 3 s volgt zo nodig herladen, met hetzelfde herstelbudget als de frame-waakhond (twee per minuut, vier per speler). Pauze, verborgen tabblad en seeks tellen niet als stilstand. Tests: `tests/stall.test.ts`.

Videopool (#50): de feed gebruikt precies 3 vaste `<video>`-elementen (slot = slide-index % 3 voor slide i-1, i, i+1), één keer gemaakt in `Feed` en geparkeerd in `.f-park` als ze niet in een slide staan; ze worden nooit aangemaakt of verwijderd tijdens het swipen, alleen van bron gewisseld (hls.js-instantie of `src`) en verplaatst naar de host-div (`.f-slot`) van de nieuwe slide terwijl hun bron leeg is. Welke slots een bron krijgen staat in de pure module `src/videopool.ts`: maximaal 2 (actief + volgende), ook bij Save-Data en 2G. YouTube-iframes blijven per slide buiten de pool. `muted`/`playsinline`/`webkit-playsinline` staan vóór de bron. Teardown is synchroon en gaat altijd vóór verplaatsen of parkeren: pauzeren, hls.js vernietigen, `src` weghalen, `load()`, beeldstatus wissen (`maakBronvrij` en `PoolEigenaars` in `src/videopool.ts`). Elke slide claimt zijn slot met een generatienummer; late async callbacks (hls.js-import, rVFC, timers) van een oude generatie raken het element niet meer. De bron wordt pas gekoppeld nadat het element in de slide staat, met attributen en listeners klaar, gevolgd door een expliciete `load()`. Een vooraf geladen buur wordt bij actief worden niet opnieuw geladen. Bij swipen en bij het vrijgeven voor geluid pauzeert de uitgaande speler vóór de `play()` van de inkomende. Tests: `tests/videopool.test.ts`, `tests/videopool-teardown.test.ts`. Op een iPhone is dit nog niet geverifieerd (alleen Playwright-WebKit op Linux, met hls.js/MSE en mp4).

Direct starten (#51): de volgende speler staat vooraf in de slide en start direct bij swipen. De poster ligt boven de video en blijft zichtbaar tot er een echt gepresenteerd frame is (requestVideoFrameCallback, anders `getVideoPlaybackQuality`/`webkitDecodedFrameCount`), niet al bij `playing` of `loadeddata`; bij YouTube tot `playerState=1`, behalve in het vangnet (`src/poster.ts`). De vaste pool houdt maximaal twee bronnen actief, ook bij mobiele data en Save-Data. `src/buffer.ts` begrenst de volgende hls.js-speler op 12 s / 4 MB (ruim), 6 s / 2 MB (mobiel of 3g) of 2 s / 1 MB (Save-Data of 2g); de actieve speler krijgt 30 s / 60 MB. Hele HLS-segmenten kunnen de grenzen overschrijden. Native HLS en mp4 gebruiken preload=auto en volgen deze limieten niet. Niet op een echte iPhone geverifieerd.

YouTube-start (#267): de nocookie-iframe krijgt inline autoplay, mute, JS-API en origin. Na laden wordt `listening` maximaal tienmaal herhaald tot `onReady`; berichten worden alleen van de eigen iframe en de verwachte origin aangenomen. Daarna krijgt de actieve, niet-gepauzeerde speler de actuele geluid- en speelopdracht. Bij status unstarted, cued of ontbrekende status volgen maximaal drie herpogingen met telkens één seconde wachttijd (`src/ytstart.ts`); bij pauze of verlaten van de slide stopt dit. Zonder `onReady`, bij autoplayblokkade, een fout of uitgeputte pogingen verbergt het vangnet de poster en laat het tikken rechtstreeks aan de YouTube-iframe over. De niet-klikbare hint „Tik op het filmpje om te starten” blijft zichtbaar tot `playing`, waarna de gewone tiklaag terugkeert. De debug-overlay toont het statusnummer en de naam, `onReady`, pogingen, vangnet en tijdstippen van YouTube-events. Tests: `tests/ytstart.test.ts`, `tests/poster.test.ts`. Niet op een echte iPhone geverifieerd.

Frame-waakhond iOS (#50): op iOS 18 kon de actieve video `playing` melden met zwart beeld, of met volle buffer bevriezen terwijl de tijd (en het geluid) doorliep. De pure module `src/framegezondheid.ts` beoordeelt elke 500 ms tijd en frameteller: loopt de klok minstens 1 s door zonder nieuw frame gedurende 2,5 s, dan `frame-vast`; komt er binnen 5 s na start (data klaar of klok loopt) geen eerste frame of blijft `videoWidth` 0, dan `geen-eerste-frame`. Pauze, seeks (ook kort erna), verborgen tabblad, einde, loops en sprongen tellen niet. Herstel gebeurt op hetzelfde poolelement (bron opnieuw koppelen op dezelfde tijd, spelen pas na `seeked`), begrensd door `HerstelBudget`: twee per minuut en vier per speler, gedeeld met het herladen uit `src/stall.ts`. CSS: geen opacity-overgang op `<video>`, `.fslide` gebruikt `contain: size layout style` (zonder paint) en de fade-in van de feed gebruikt `animation-fill-mode: backwards`, zodat er na de animatie geen compositielaag boven de videolaag blijft. Tests: `tests/framegezondheid.test.ts`. Niet op een echte iPhone geverifieerd (wel Chromium met lokale HLS/mp4).

Video-debug (#50): open `/?debug=1#/dumpert` voor de verborgen diagnose-overlay; alternatief: zet localStorage `nieuwsinkort-debug` op `1`. De overlay toont spelers, balkstand en recente media-events, per element `src`-attribuut en `currentSrc` apart, `videoWidth`x`videoHeight`, generatie, frameteller (gepresenteerd/gedecodeerd), leeftijd van het laatste frame en herstelevents (`frame-vast`, `geen-eerste-frame`, `herstel`, `herstel-op`).

Geluid (#66): `src/geluid.ts` onthoudt de keuze voor filmpjes, shorts en Dumpert in sessie- en localStorage, met een geheugenfallback. Bij een gebruikersgebaar worden de poolelementen vrijgegeven (per element één keer, de actieve speler wordt daarbij niet onderbroken); weigert autoplay geluid, dan verschijnt „Tik voor geluid” zonder de keuze te wissen. YouTube krijgt de keuze via zijn iframe. Dit is nog niet op een echte iPhone geverifieerd.

Kopkaart (#150): `.nc-head` is alleen op Home schermvullend. Tabs krijgen de klasse `kompakt` (`kopKompact()` in `src/tabbriefing.tsx`): zonder samenvatting een datumregel van `--kop` hoogte, met samenvatting een kop met automatische hoogte en maximaal 60% van de feedhoogte. Daaronder begint het eerste bericht direct in beeld. De tabsamenvatting verschijnt na het herladen van `/data.json` (15 min, visibilitychange; geen service worker, `no-cache`).

`src/feedstatus.ts` bewaart en leest de feedstatus en kiest bij herstel de beschikbare lijst en een passende slug.

Swipe-feed (#64): De open swipe-feed bewaart per tabblad de categorie, soort, slug, afspeelpositie en de videolijst in sessionStorage en history.state. De lijst blijft tijdens verversen vaststaan; bij herladen wordt een verdwenen slug opgevangen met een naburig filmpje of de bewaarde lijst. Bij verbergen pauzeert de actieve speler en bij terugkomst hervat deze als hij speelde. Browserbeleid kan automatisch hervatten blokkeren.

Bufferregels (#36): `src/buffer.ts` bepaalt per netwerkniveau de seconden en bytes voor de actieve en volgende hls.js-speler. De pool laadt geen spelers vanaf +2. Tests: `tests/buffer.test.ts` en `tests/videopool.test.ts`.

Tijd: `src/tijd.ts` deelt `midnight()` tussen frontend en Worker en corrigeert de offset op DST-wisseldagen naar die van middernacht zelf. `filters.tsx` gebruikt `gegenereerd` als referentiedag (bij ontbrekende/ongeldige waarde: nu) en laat berichttijden tot 20 minuten vooruit op die dag staan. Vandaag begint op de huidige Amsterdamse middernacht; 1u/3u rekenen tegen `Date.now()`. Regressietests: `tests/filters.test.ts`.

## Laadprestaties (#35)

- **Vroege data.json**: het inline script in `index.html` start `window.__vroegData = fetch("/data.json", {cache:"no-cache"})` tijdens het parsen; `useData` neemt die promise eenmalig over via `neemVroegeData()` (`src/vroeg.ts`), daarna haalt elke verversing zelf op. Wijzig je dat script, werk dan de CSP-hash in `public/_headers` bij (de test bewaakt het).
- **Fonts self-hosted**: Inter (OFL, variabel 400-600) staat in `public/fonts/` (`inter-latin`, `inter-latin-ext`, woff2 uit Google Fonts v20), `@font-face` met `font-display: swap` bovenaan `src/index.css`, preload van het latin-bestand in `index.html`. CSP: `font-src 'self'`, geen Google-origins meer; `/fonts/*` is immutable gecachet.
- **Kaarten gemount op afroep**: `NewsFeed` geeft alleen de eerste `KAARTEN_VOORAF` (6) kaarten en een venster van `KAARTEN_VOORUIT` (6) voorbij de huidige kaart (en voorbij `focusKey`) inhoud (`KaartInhoud`); de rest blijft een lege `<section class="nc">` met dezelfde hoogte, `data-id` en `aria-label`, zodat scroll-snap, `scrollIntoView`/`offsetTop`-sprongen en toetsenbordnavigatie ongewijzigd werken. Het venster krimpt nooit.

### Vooraf laden (`src/voorladen.ts`, `src/usevoorladen.ts`)

Na `load` + `requestIdleCallback` (fallback `setTimeout`), wachtend op een zichtbaar tabblad, plant `planVoorladen` (puur, getest in `tests/voorladen.test.ts`; de hook zelf in `tests/usevoorladen.test.ts`, met een kleine React-dispatcher- en browserdouble) wat er warm moet, met de lijsten zoals de UI ze toont (Filmpjes: startsoort met actieve filters; Dumpert). `useVoorladen` in `App.tsx` doet dit één keer per sessie en opnieuw alleen bij een nieuwe `gegenereerd`; niets als je al op een video-route zit. Dit werkt op alle verbindingen hetzelfde, ook bij mobiele data en Save-Data.

- 6 thumbnails per tab (`new Image`, async decoding, `fetchPriority` low), `import("hls.js")` (zelfde chunk als `feed.tsx`, niet op Apple), voor de eerste 2 HLS-video's master → laagste variant → 2 segmenten via `/media/dumpert` (zelfde logica als `warmHls` in `feed.tsx`, bewust gedupliceerd), de eerste 256 KB van de eerste mp4 (Range-request), `preconnect` naar de mp4-host en youtube-nocookie.
- Max 3 requests tegelijk, alles `priority: low`. Geen AI-aanroepen.
- De mp4-Range: of de browser de gecachete bytes voor `<video>` hergebruikt hangt af van de cache-headers van de Instagram-CDN en de browser (Chrome kan gedeeltelijke cache-items hergebruiken); dat is niet in een echte browser geverifieerd. Zeker is het nut van de warme DNS/TLS-verbinding en de CDN-edge.
- CSP: `img-src https:`, `connect-src https:` en `media-src https:` dekken dit; `_headers` is niet gewijzigd.

## Pages Functions (`functions/`)

- `data.json.ts`: haalt het statische `data.json` (ASSETS) en KV `uur`, voegt ze samen (`merge`): routine-samenvattingen blijven, nieuwe berichten van het uur komen bovenaan, weer/filmpjes/Dumpert worden ververst. Uur-data van een andere dag wordt genegeerd. `src/vandaag.ts` filtert na de merge artikelen en video's op de huidige Amsterdamse dag; bij oude data verdwijnt ook de dagsamenvatting. Legacy-items zonder publicatiedatum gebruiken de tijd van generatie met 20 minuten marge. `?statisch=1` geeft het onbewerkte statische bestand, zonder dagfilter. Voegt ook `sv-klaar` (vooraf gemaakte video-samenvattingen) toe. Antwoord met zwakke ETag en 304 bij `If-None-Match`; `Cache-Control: max-age=0, must-revalidate, stale-while-revalidate=300` (de client vraagt altijd met `cache: "no-cache"` zonder cachebuster, dus de uurdata is direct vers en een ongewijzigde respons kost alleen een 304). `slim()` haalt de niet-gebruikte diagnosevelden `ontdubbeld` en `routine_gegenereerd` weg.
- `samenvatting.ts`: `POST /samenvatting {id}`, samenvatting van één filmpje (alleen filmpjes die op de site staan). Tekst via YouTube-ondertiteling of Whisper, daarna samenvatten. Cache in KV (`vs:<id>`), ook fout-uitkomsten (30 min). Bewaakt het gedeelde dagbudget. Bescherming tegen misbruik: `Content-Type: application/json` verplicht (415), vreemde `Origin` geweigerd (403; `vooraf.ts` stuurt geen Origin), slot per video (409 bij bezig) vóór de budget- en mediastappen, geschatte Whisper-neuronen worden vóór `AI.run` atomair gereserveerd en achteraf verrekend met het echte verbruik, een globale rem van max 30 Whisper-aanroepen per uur (daarna code `druk`), en interne foutteksten (`why`) gaan alleen terug bij `pre:true`. Slot, reservering en uurrem zijn van de Durable Object `Budget` (binding `BUDGET_DO`, één instantie `dag`; zie hieronder), want KV is niet atomair. Is de DO onbereikbaar, dan antwoordt de Function 503 (niet gecachet); ontbreekt de binding (lokaal/preview), dan valt ze terug op het oude KV-gedrag (`vs-bezig:<id>`, `vs-uur:<datum>T<uur>`, `vid-neurons:<datum>`), een rem zonder harde garantie. De Cloudflare Rate Limiting-regel (issue #8) blijft apart en is nog open.
- `meer.ts`: `GET /meer?k=<sleutel>`, extra tekst voor "Lees verder" uit KV `meer` (artikeltekst, AI-uitleg, kernpunten per bron), anders 404.
- `media/dumpert/[[path]].ts`: GET/HEAD-proxy naar media.dumpert.nl voor HLS (CORS staat daar alleen dumpert.nl toe).

Bindings in `wrangler.toml`: KV `NIEUWS` en Workers AI `AI`.

## Worker `nieuwsinkort-uur` (`worker/`)

- Cron `0 4-22 * * *` (UTC). `scheduled()` slaat uren buiten 06–23 Amsterdam over (zomer- en wintertijd). `workers_dev = false`.
- Durable Object `Budget` (sqlite, `worker/src/budget.ts`, logica in `src/budget.ts`, binding `BUDGET_DO`, migratie `v2`): enige eigenaar van (a) het slot per video-id (verloopt na 90 s, expliciet vrijgeven met token), (b) de video-neuronen per dag (atomair reserveren van de schatting tegen nieuws + video + reserve + marge, daarna verrekenen) en (c) de Whisper-rem `MAX_WHISPER_UUR` = 30 per uur. De DO spiegelt het dagtotaal naar KV `vid-neurons:<datum>`; de uur-Worker leest dat voor het gedeelde dagbudget. De shell voert alle operaties via een interne promise-keten (mutex) strikt na elkaar uit, omdat de KV-read/-write (zaad, spiegel) de input gate opent en operaties anders zouden interleaven. Pages Functions gebruiken dezelfde klasse via `script_name = "nieuwsinkort-uur"` in de root-`wrangler.toml`, via de fetch-API van de stub (`/claim`, `/vrij`, `/stand`, `/reserveer`, `/verreken`).
- Durable Objects (sqlite): `RUNNER` (klasse `Runner`: de uurrun, budget, state, alarm voor video-samenvattingen vooraf) en `FETCHER` (klasse `Fetcher`: ophalen in batches, eigen limiet van 50 subrequests per instantie).
- KV `NIEUWS`. Resultaat van de run staat onder `uur` (items, filmpjes, dumpert, weer, bronstats, meta). Verder o.a. `meer`, `sv-klaar`, `vooraf-log`, `vs:<id>`, `og:<genormaliseerde-url>` (og:image, 3 dagen), `vid-neurons:<datum>` (spiegel van de video-neuronen van vandaag; bron is de DO `Budget`, de uur-Worker leest dit) en state. `vs-bezig:<id>` en `vs-uur:<datum>T<uur>` worden alleen nog gebruikt zonder DO-binding (fallback).
- Workers Issues: `[observability.issues] enabled = true` in `worker/wrangler.toml` (gratis open beta, wrangler >= 4.134) groepeert fouten uit de Worker-logs. Alleen configuratie; geen extra kosten of code.
- Endpoints: `/run` (run starten, optioneel `force=1`), `/uur` (KV `uur` als JSON), beide met header `Authorization: Bearer <RUN_KEY>` (SHA-256 en XOR-vergelijking; geen sleutel in de URL); `/status` (open, alleen meta + vooraf-log).
- `Runner` bewaart elke runstart in DO-storage; `force=1` wordt binnen tien minuten geweigerd met 429, ook na een mislukte run. Fouten geven alleen een melding van maximaal 200 tekens terug; de stack wordt serverzijdig gelogd.
- Vars: `SITE`, `MODEL`, `CAP`, `BUDGET`, optioneel `SMALL_MODEL`, `NEURON_FACTOR`, `MISTRAL_MAAND_TOKENS` en `MISTRAL_TUSSENPOOS_MS`. Secrets: `RUN_KEY`, optioneel `GROQ_API_KEY` en `MISTRAL_API_KEY`.
- Publicatietijden: `src/vandaag.ts` bewaakt Amsterdamse middernacht, accepteert 15 minuten toekomstmarge en klemt tijden tot 2 uur 15 minuten vooruit naar nu; latere tijden en ontbrekende datums vallen af. Items en video's krijgen epochveld `t`; een cluster gebruikt zijn nieuwste lid. Dumpert toont alleen vandaag.
- Stappen van een run: bronnen ophalen → berichten van vandaag ontdubbelen/clusteren → bestaande samenvattingen uit state hergebruiken → nieuwe clusters samenvatten (5 per prompt) → foto's (feed, anders og:image, 3 dagen gecachet) → "In het kort" en weertekst alleen bij gewijzigde invoer → "Lees verder"-tekst → `uur` schrijven → alarm: video-samenvattingen vooraf (`vooraf.ts`, roept `/samenvatting` aan met `pre:true`).
- Clusteren (`worker/src/cluster.ts`, pure module): kandidaten op tijd gesorteerd, per kandidaat vergelijking met elk clusterlid afzonderlijk (max over leden, niet met de unie); past hij bij meer clusters, dan worden die samengevoegd. Tokens: kleine letters zonder accenten, lichte NL-stam (meervoud -en/-s, synoniemen zoals verbod/verbieden en basisschool/basisonderwijs), stopwoorden incl. hulpwerkwoorden (wil, gaat, moet), plus hoofdletter-acroniemen van 2 letters (AI, EU). Samen als overlap ≥2 woorden met Jaccard ≥0,45 (zonder acroniemen) of ≥4 woorden met Jaccard ≥0,3; minstens 1 (voor de ruime regels 2) gedeeld woord buiten de lijst `ALGEMEEN` (jaartallen en postcodedelen tellen niet). Een kandidaat wordt met elk clusterlid afzonderlijk vergeleken (max over leden, niet met de unie van de tokens) en voegt alle clusters samen waar hij bij past. Beschrijving alleen als extra bewijs: bij ≥2 eigen titelwoorden streng (≥8 woorden, Jaccard ≥0,5), of bij 1 eigen woord + gedeeld acroniem (AI, EU) + ≥2 gedeelde titelwoorden (≥9 woorden, Jaccard ≥0,25). De `covered()`-check tegen de routine gebruikt dezelfde `toks`/`sim`. Naspelen: `tests/live-cluster.ts` (oud vs. nieuw op een `data.json` of op feedtitels van `scripts/feedtitels.mts`).
- Rubrieken: de feedgroep (`f.g`) is de rubriek van een kandidaat; de AI classificeert niet. Buitenland ontstaat achteraf: na het bouwen van de items zet de Worker cat `nl` om naar `buitenland` met `isBuitenland()` uit `src/regio.ts` (bron-signalen uit buitenlandfeeds en hele URL-padsegmenten, Nederlands anker in kop/samenvatting, landnamen en enkele buitenlandse economische namen in economische context als terugval). De Worker weegt alle oorspronkelijke clusterkoppen en bronnen mee, zodat bronnen van één herkend verhaal samen de regio bepalen. Voetbal, Formule 1 en Auto hebben eigen feedgroepen en rubrieken; de selectie reserveert maximaal één nieuw cluster per sportrubriek, samen maximaal drie binnen de runlimiet. Andere rubrieken behouden hun bestaande indeling; Aziatische beurzen vallen vanuit `nl` onder Buitenland. Clusters en AI-selectie (`ROUND`) blijven `nl`; "In het kort" krijgt Buitenland als eigen rubriek (max 10). De frontend past dezelfde `herindeel()` toe bij het laden, zodat routine-items en oude KV-data ook kloppen; `src/sources.ts` telt Buitenland onder bronnengroep `nl`.
- Onderdelen: `parse.ts` (RSS/Atom), `videos.ts` (Dumpert, YouTube-kanalen), `reddit.ts` (Reddit-video's), `x.ts`, `redlib.ts`, `weer.ts`, `artikel.ts`, `ai.ts`.

### Tekst-AI en budget

Artikelteksten, het dagoverzicht en “Lees verder” vragen om eenvoudig Nederlands voor volwassenen (ongeveer B1): korte zinnen (liefst hooguit 15 woorden, nooit meer dan 20), moeilijke woorden uitleggen, afkortingen bij eerste gebruik voluit en alleen feiten uit de invoer. De nieuwsprompt vraagt 2–3 korte zinnen en hooguit twee aanvullende punten, of een lege lijst. Het uitvoerbudget is 180 tokens per bericht plus 80 voor de JSON-structuur (klein model 150 plus 80). Samenvattingen blijven per bronlink in `st.sums` gecachet; daarnaast verwijst een deterministische, gesorteerde set titelwoorden van minstens vier letters zonder stopwoorden, gebonden aan de rubriek, maximaal 24 uur naar een bestaande samenvatting. De cache overleeft middernacht; verlopen verwijzingen worden opgeruimd. Een promptwijziging maakt bestaande samenvattingen niet opnieuw.

Modellen: `@cf/google/gemma-4-26b-a4b-it` (`MODEL`, hoofd), `@cf/meta/llama-3.2-1b-instruct` (`SMALL_MODEL`), `@cf/openai/whisper-large-v3-turbo` (audio, max 3 min). Dagbudget `BUDGET`=9000 neuronen (gratis limiet 10.000), `CAP`=40 per run. Het neuronbudget wordt gedeeld door de Worker en `functions/samenvatting.ts`. Tekstverzoeken proberen normaal Workers AI, daarna Groq en Mistral als hun sleutels zijn ingesteld. Groq en Mistral hebben eigen limieten en tellen tokens, geen Workers AI-neuronen; `meta.aiTokens` toont tokens per aanbieder. Voor "Lees verder" krijgt Groq voorrang als de sleutel aanwezig is. Zie [AI-aanbieders en secrets](ai-aanbieders.md).

| Verbruik | Gedrag |
|---|---|
| < 70% | hoofdmodel, max 40 per run |
| 70–90% | klein model, max 15 per run |
| 90–100% | alleen NL en Haarlem, max 8 |
| 100% | geen Workers AI voor nieuwe clusters; extractieve tekst met `ruw: true` voor clusters zonder samenvatting (zie hieronder), kaart toont "nog niet samengevat" |

De tabel beschrijft de selectie op basis van het Workers AI-budget bij de start van de run. Als tijdens een run het dag- of runbudget wordt bereikt, kan een al geselecteerde groep met een Groq-sleutel via de externe keten doorgaan; bij 100% aan het begin worden geen nieuwe clusters geselecteerd.

**Extractieve fallback (#80)**: `worker/src/extractief.ts` (pure functies `schoon`, `zinnen`, `knip`, `eersteZinnen`, `extractief`). Bij een bereikt dag- of runbudget, een tijdelijke AI-fout of ontbrekende Workers AI komt elk cluster zonder AI-samenvatting met een bruikbare titel als `ruw: true`-item op de site, ook tech, Haarlem en Engelstalige bronnen (geen `.nl`-host). Kop: opgeschoond (HTML, entiteiten, prefixes als "Podcast |", "LIVE", "VIDEO"), max 120 tekens. Samenvatting: de eerste 2–3 hele zinnen van de omschrijving, samen ±50 woorden; zinsgrenzen negeren afkortingen ("o.a.", "dhr.") en voorletters. Engels: eerste zin met het voorvoegsel "(Engels)". De volgende run met AI vervangt het item (ruw → samenvatting). Politiek houdt zijn eigen regel. Kost geen neuronen.

Video-samenvattingen vooraf stoppen vanaf 85%; AI-uitleg via Workers AI voor "Lees verder" alleen onder 65%, terwijl Groq met een sleutel ook daarboven gebruikt kan worden. Ondertiteling kost ±5 neuronen, Whisper ±44–133.

Meting (#79, details en bevindingen in [ai-budget.md](ai-budget.md)): de dagteller loopt op de UTC-dag (Cloudflare reset 00:00 UTC; `state.neuronDag`, `vid-neurons:<UTC-dag>`), de cache en weergave blijven op de Amsterdamse dag. Per aanroep telt `r.usage` (anders een schatting met vlag `geschat`), ook bij een fout; per run en per dag staan tokens, neuronen en `geschat` in `uur.meta` en `state`. `quotaOut` volgt het eigen dagbudget of een echte dagquota-fout (4006, KV-vlag `ai-quota:<UTC-dag>`); een tijdelijke 429 stopt alleen de rest van de run. Optionele env `NEURON_FACTOR` (standaard 1, niet in `wrangler.toml`) verkleint het effectieve budget tot `BUDGET / factor`. Logica in `src/budget.ts` (ook voor `functions/samenvatting.ts`), test in `tests/budget-meting.test.ts`.

## Externe bronnen

Alle verzoeken met UA `nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)`, behalve waar de code een browser-UA nodig heeft (bijv. artikelpagina's, AD) of een feedlezer-UA (Reddit).

- **RSS**: lijst in `public/bronnen.json` (gebouwd uit `scripts/pipeline/feeds.json`, zie `scripts/build-bronnen.mjs`).
- **Hacker News**: `hnrss.org/best` (news.ycombinator.com/rss geeft 419 aan Cloudflare).
- **X**: fxtwitter-API, terugval syndication. Tekstposts en video's van politieke accounts en Politie Haarlem.
- **YouTube**: officiële gratis kanaal-RSS voor Filmpjes van NOS, RTL Nieuws, NU.nl, Hart van Nederland, NH Nieuws, PowNews, WNL, EenVandaag, RTL Z, BNR, NOS Stories, Nieuwsuur, Omroep PowNed, Radar, NOS Sport, Ziggo Sport, ESPN NL, OnsOranje, FORMULA 1, AutoWeek en Autovisie, inclusief Shorts. Ondertiteling geeft vanaf Cloudflare vaak LOGIN_REQUIRED; `functions/samenvatting.ts` onthoudt een mislukte samenvatting dan 3 uur per video; de kanaalfeeds blijven gewoon opgehaald worden.
- **TikTok en Facebook**: geen kanaalfeed voor Filmpjes, omdat daarvoor geen gratis feed beschikbaar is die aan de voorwaarden voldoet.
- **Instagram**: profiel-embed, reels als filmpjes.
- **Dumpert**: toppers-pagina en HLS via de proxy (max 720p, H.264).
- **Reddit**: RSS (`top/.rss?t=day`) → old.reddit → Redlib-instances (roterend, HTML omgezet naar Atom) → laatste gelukte kopie van vandaag. Publieke Redlib-instances blokkeren Cloudflare nu vaak.
- Filmpjes worden eerst ontdubbeld en op score geselecteerd: maximaal 18 Shorts en 14 Journaals. Binnen die plafonds krijgen Reddit, X en Instagram elk maximaal twee beschikbare unieke filmpjes voorrang; de resterende plaatsen volgen de scorevolgorde. Dumpert heeft een eigen tab.
- Reddit-filmpjes spelen `v.redd.it` rechtstreeks af via HLS, zonder proxy. YouTube-links in posts gebruiken de YouTube-embed; andere videolinks worden overgeslagen. De verwijzing naar de Reddit-post blijft bewaard voor ontdubbeling.
- **Weer** (landelijk, plaats "Nederland"): Buienradar (alle landstations: mediaan en koudste–warmste, landelijke 5-daagse), Open-Meteo als terugval (Groningen, De Bilt, Maastricht in één verzoek), KNMI-weerbericht (bron: KNMI, CC0) en de landelijke waarschuwingsregel uit datzelfde weerbericht (code geel/oranje/rood, ergste wint). Geen provinciepagina's: `/waarschuwingen` stuurt door naar Utrecht en per provincie ophalen kost subrequests. Ontbrekende bron = veld weg. De AI-herschrijving (`simpelWeer`) blijft één aanroep met max 1500 tekens invoer. Rubriek Haarlem is los van het weer.
- **Overig**: openraadsinformatie (gemeenteraad), og:image van artikelpagina's.
- Lukt niet: BleepingComputer (403).

## Scripts

- `export_from_canvas.mjs`: canvas-bron → `public/data.json` (draait `fix-dumpert.mjs` en `add-beelden.mts`).
- `scripts/build-bronnen.mjs`: bouwt `public/bronnen.json` (env `FEEDS_JSON`, `FILMPJES_PY`; laat het bestaande bestand staan als `feeds.json` ontbreekt).
- `scripts/fix-dumpert.mjs`: zorgt voor afspeelbare Dumpert-embeds, laat items zonder video weg.
- `scripts/add-beelden.mts` + `dhash.py`: foto's per bericht (og:image, dubbele foto's weg via URL en perceptuele hash); cache in `scripts/.cache/` (genegeerd door git).
- `scripts/pipeline/`: komt via PR #1 en staat mogelijk nog niet op `main`. Controleer de map voor je ervan uitgaat dat hij er is.
- `tests/`: één `*.test.ts` per onderwerp, zoals `dedup.test.ts` (video-ontdubbelen), `beeld-ontdubbelen.test.ts`, `data-merge.test.ts` (merge/schoon), `stall.test.ts` (videoherstel) en andere regressietests via `npm test`, plus `live-dedup.ts` (handmatige check op echte data).

## Testopzet

`npm test` bundelt alle `tests/*.test.ts` met esbuild en draait ze afzonderlijk met Node.
Basistests zijn per module of onderwerp ingedeeld; sinds 30 oktober 2026 vullen
`*-randgevallen.test.ts` die aan met grensgevallen, beschreven in het testbestand zelf.
Pages Functions worden lokaal getest met onder meer nep-KV en nep-ASSETS.
Randgevaltests gebruiken vaste tijdstempels of een vaste klok en geen netwerk;
oudere tests gebruiken soms de huidige tijd. Netwerkafhankelijke onderdelen worden
in geautomatiseerde tests met lokale doubles getest. `tests/live-*.ts` zijn aparte,
handmatige checks op echte data en draaien niet mee met `npm test`.

## Deploy

`deploy.sh` (zie README). Volgorde bij wijzigingen aan `Budget`: eerst de Worker (`DEPLOY_WORKER=1 ./deploy.sh`, `deploy.sh` doet de Worker vóór Pages), daarna Pages, omdat de Pages-binding `BUDGET_DO` de klasse en migratie `v2` van `nieuwsinkort-uur` nodig heeft. `main` in het bestand `DEPLOY_BRANCH` (geen omgevingsvariabele; `deploy.sh` leest het bestand) zet de nieuwe build in productie; een andere waarde zet productie op de bevroren site `prod-frozen/` met verse data en de nieuwe build op een preview-branch. De Worker gaat apart (`DEPLOY_WORKER=1` of `wrangler deploy` in `worker/`). Alleen met goedkeuring van Joey.

## Domein

nieuwsinkort.nl staat bij STRATO en is **nog niet** aan het Pages-project gekoppeld. Plan: DNSSEC bij STRATO uit, nameservers naar Cloudflare, daarna nieuwsinkort.nl en www.nieuwsinkort.nl als custom domain aan het Pages-project toevoegen. Tot dan draait de site op nieuwsinkort.pages.dev (controleer bij de koppeling ook `public/robots.txt` en `public/sitemap.xml`).

## Open punten

- Domein koppelen (zie boven).
- Of `RUN_KEY` als Worker-secret is ingesteld, is niet vastgelegd; zonder werken `/run` en `/uur` niet (403).
- "Lees verder" verschijnt in elke rubriek bij berichten met tekst, ook bij ruwe berichten: de detailpagina toont de volledige samenvatting, alle kernpunten en bronnen. Alleen bij een `meer`-sleutel haalt de site extra tekst op via `/meer`; als die ontbreekt of ophalen mislukt blijft de detailpagina bruikbaar. Artikeltekst ophalen (`worker/src/artikel.ts`) wordt door sommige sites geweigerd.
- `src/leesverder.ts` bepaalt of een bericht Lees verder heeft en haalt alinea’s, kernpunten en bronnen voor de detailpagina uit het bericht.
- Het kopje **Uitgebreid** staat altijd in de detailpagina, ook zonder `meer`-sleutel of bij een mislukte `/meer`-aanroep (#184, `src/uitgebreid.ts`). Keten: AI-uitleg (Workers AI, Groq, Mistral; gecachet in `st.diep` in KV-state, per artikel één keer, `zonderUitleg` slaat gecachete artikelen over) → alineas uit de bron → samenvatting/kernpunten van het bericht → de kop. Geen extra AI-aanroepen of neuronen; geldt voor Nederland en Buitenland.
- Redlib-instances blokkeren Cloudflare; Reddit valt daardoor soms terug op een oude kopie.
- YouTube geeft vaak LOGIN_REQUIRED vanaf Cloudflare.
- De bronnenlijst wordt standaard uit de gereviewde invoer in `scripts/pipeline/` gebouwd.
- `scripts/pipeline/` (PR #1) nog niet op `main`.

### KV-schrijflimiet uur-Worker

`begrensOg()` in `src/kv.ts` verwijdert dubbele links en beperkt de lijst tot de eerste 30.

Per run worden maximaal 30 unieke og-links opgehaald (dus hooguit 30 `og:`-schrijfpogingen). `meta.kvWritesOg` telt deze pogingen; `meta.kvWrites` telt daarnaast de door Fetcher gemelde Instagram-cachepogingen en de drie eindschrijfpogingen (`uur`, `state`, `meer`), ook bij fouten. De drie eindpogingen zijn vooraf meegeteld zodat de opgeslagen `uur`-metadata ze bevat. Losse video-alarmen en Pages Functions vallen buiten deze runteller; dit is geen accountbreed dagbudget.

`uur` wordt eerst apart geschreven. KV-eindschrijffouten worden gelogd via `console.error`; ook bij fouten op `state` of `meer` wordt het video-alarm gezet. Een mislukte `vooraf-log`-schrijfactie houdt het volgende alarm evenmin tegen. Bij een fout op `uur` blijft de eerder opgeslagen versie staan.

Deploy-integriteit: `deploy.sh` weigert een vuile werkboom en een na de build van HEAD
 afwijkende `public/bronnen.json`, tenzij bewust `ALLOW_DIRTY=1` is ingesteld.
Dit vervangt nooit de vereiste deploygoedkeuring. Pages krijgt de commit-hash mee.
`npm run build` schrijft `dist/version.json` met `commit`, `datum` en `bronnenSha256`;
ook bij `SKIP_BUILD=1` vernieuwt het deployscript deze metadata.
De bronnenlijst gebruikt standaard `scripts/pipeline/feeds.json` en `filmpjes.py` uit
 dezelfde map; een externe `FEEDS_JSON` geeft een waarschuwing. Een ongewijzigde
 lijst behoudt haar generatiedatum. Gewijzigde bronnen eerst beoordelen en committen.

## Signalering van runfouten

`Runner` logt mislukte runs met `console.error`. DO-storage en KV `run-status` bevatten `faalReeks`, `laatsteFout` en `laatsteOk` (ISO-tijdstippen, aanvankelijk `null`). Succes zet de reeks op 0; het laatste fouttijdstip blijft bewaard. Per gewijzigde status volgt één KV-write. Opslagfouten worden apart gelogd; de runrespons blijft behouden. De cron logt ook niet-succesvolle HTTP-responsen en transportfouten. Ingeslikte fouten in Pages Functions loggen vaste context zonder foutobjecten of verzoekgegevens. Tests gebruiken uitsluitend lokale doubles. Een Cloudflare Notification vereist apart akkoord en dashboardconfiguratie.

### Sport en auto (#58)

De bronnengroepen Voetbal, Formule 1 en Auto hebben eigen feeds in `scripts/pipeline/feeds.json`. Een optionele `max` begrenst per feed de nieuwste kandidaten per run. Algemene berichten uit Nederland, Buitenland en Tech kunnen vóór de AI-keuze worden heringedeeld via `worker/src/sportcat.ts`, op basis van bronpaden en conservatieve titelsignalen. Politiek, Haarlem, Showbizz en bestaande sport- en autorubrieken blijven staan. Bij meerdere signalen geldt Formule 1 boven Voetbal boven Auto; dezelfde prioriteit geldt bij clusters met verschillende bronrubrieken. Verkeersongelukken blijven buiten Auto. Ook de berichten van de ochtendroutine worden heringedeeld. Items uit autobronnen (cat `auto`) kunnen omhoog naar Formule 1 (coureurs, GP, pole position) of Voetbal; zonder zulk signaal blijven ze Auto (#93).

Showbizz heeft eigen feeds (RTL Boulevard-site, Telegraaf Entertainment, NU.nl Achterklap/Muziek/Film, NOS Cultuur & media, Linda.nl met `max` 5). Omdat de eerste feed met een link wint, worden nl- en buitenlandclusters daarna via `worker/src/showcat.ts` Showbizz als minstens de helft van de kandidaten uit een showbizzfeed komt of een showbizzpad heeft (rtl.nl/boulevard, nu.nl achterklap/entertainment/media/muziek/film, telegraaf.nl/entertainment, ad.nl show/cultuur, volkskrant.nl/cultuur-media, linda.nl). Sport gaat voor, politiek blijft politiek, en berichten over misdaad of justitie (politie, OM, rechtbank, arrestatie, liquidatie, crimineel; zie `MISDAAD` in `showcat.ts`) blijven buiten Showbizz (#110); ook de routine-items worden heringedeeld. YouTube-, Instagram-, Reddit- en Kittygram-feeds tellen per feed-URL niet als nieuws (behalve bij Politiek), zodat de RTL Boulevard-site wel telt terwijl de bron ook YouTube-feeds heeft. De dagfilter (#56) blijft ongewijzigd.

De AI-ronde kiest bij de eerste twee budgettrappen eerst hooguit één cluster per sportrubriek, in de volgorde Formule 1, Voetbal en Auto. De overige plaatsen volgen de bestaande ronde Nederland, Nederland, Tech, Haarlem en Showbizz. De bestaande CAP en het run- en dagbudget blijven gelden; vanaf trap 3 blijft de selectie beperkt tot Nederland en Haarlem. De frontend voor deze rubrieken volgt in #59.

## AI-aanbieders

De uur-Worker gebruikt een uitbreidbare keten van tekstmodellen met Groq en daarna Mistral als fallback en per model conservatieve UTC-dag- en minuutlimieten. Mistral heeft daarnaast een UTC-maandlimiet, instelbaar via `MISTRAL_MAAND_TOKENS`, en minimaal 1,1 s tussen verzoeken (`MISTRAL_TUSSENPOOS_MS`); bij HTTP 429 volgt eenmaal een retry na `Retry-After` (max 5 s). Lees verder geeft Groq voorrang. De bestaande Workers AI-budgettrappen blijven gelden. Zie [AI-aanbieders en secrets](ai-aanbieders.md).

### Taboverzichten (#134)

De uurdata bevat optioneel `tab_samenvatting`, met per rubriekcode `tekst`, `ai`, `bron` en `gegenereerd`. Home gebruikt de bestaande `dag_samenvatting`. De Worker gebruikt uur- en routineartikelen en bewaart succesvolle AI-teksten met een volgordeonafhankelijke inhoudshash maximaal zeven dagen in de bestaande KV onder `tabsam:<tab>:laatste`. Bij wijzigingen blijft de vorige tekst minstens zes uur staan; voor AI worden maximaal tien korte berichten gebruikt. Bij cachemissers zonder AI ontstaat extractieve tekst; die wordt niet gecachet zodat een volgende run AI kan proberen. Filmpjes en Dumpert krijgen geen overzicht. Oude data zonder dit veld toont geen taboverzicht.

Workers AI-aanroepen zijn begrensd op 20 seconden per poging. Bij een timeout,
HTTP 429 of HTTP 5xx volgt eenmaal een nieuwe poging na 250 ms. Fouten worden
zonder invoertekst gelogd met model, duur en een code (`LLM_TIMEOUT`,
`LLM_RATE_LIMIT`, `LLM_HTTP_5XX` of `LLM_FOUT`). Een timeout kan de onderliggende
Workers AI-aanroep niet afbreken; die kan nog neuronen kosten.
