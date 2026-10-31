# CLAUDE.md

Werkinstructies voor Claude Code in deze repo (nieuwsinkort). Overzicht: [README.md](README.md). Architectuur: [docs/architectuur.md](docs/architectuur.md). Alle teksten en UI zijn Nederlands.

## Harde regels

- **Nooit deployen zonder uitdrukkelijke goedkeuring van Joey.** Dus niet: `./deploy.sh`, `npm run deploy`, `wrangler deploy`, `wrangler pages deploy`, `wrangler secret ...`, `wrangler triggers ...`, ook niet met `DEPLOY_WORKER=1`. Goedkeuring voor één deploy geldt niet voor de volgende.
- **Geen secrets committen**: `.env`, `.dev.vars`, tokens, API-keys, `RUN_KEY`-waarde, cookies. Variabelenamen mogen in docs, waarden niet. Controleer `git diff` op secrets voor je commit.
- **Werk op een branch en maak een PR.** Nooit pushen naar `main`. Niet mergen: dat doet Joey.
- Draai de **volledige testsuite (`npm test`) één keer aan het eind**, niet na elke stap.
- **Respecteer het Workers AI-neuronbudget** (`BUDGET`=9000, `CAP`=40, zie hieronder) bij elke wijziging aan AI-aanroepen. Gratis limiet is 10.000 neuronen per dag, gedeeld door de uur-Worker en `functions/samenvatting.ts`.
- **Changelog per PR als fragment**: werk `changelog.d/<issue>-<slug>.md` bij (opsommingspunt(en)) en bewerk `CHANGELOG.md` niet zelf; de coördinator draait `npm run changelog` (`scripts/changelog.mjs`, test `tests/changelog.test.ts`) vóór een release, niet in `deploy.sh`.
- Wijzig `DEPLOY_BRANCH`, `wrangler.toml`, `worker/wrangler.toml` (crons, bindings, vars) alleen als de taak dat vraagt.

## Commando's

```bash
npm ci
npm run lint       # ESLint (eslint.config.mjs): 0 errors, warnings informatief
npm run check      # lint, tests, build en typechecks voor Worker en Functions
npm run dev        # Vite 8 (devDependencies: vite, wrangler 4, esbuild expliciet; Node >= 20.19)
npm run build      # build-bronnen.mjs + tsc --noEmit + vite build
npm test           # esbuild-bundels van regressietests, draaien met node
npm run bronnen    # alleen public/bronnen.json opnieuw bouwen
```

Worker: `cd worker && npm ci`; typecheck zie `worker/tsconfig.json`. Lokaal draaien: `npx wrangler dev --test-scheduled` met lokaal ingestelde `RUN_KEY` (alleen lokaal, AI blijft remote en kost neuronen).

Worker-endpoints `/run` en `/uur` vereisen `Authorization: Bearer <RUN_KEY>`; zet de sleutel nooit in de URL. `force=1` mag pas tien minuten na de laatste runstart. Test met mocks, zonder echte AI-aanroepen.

## Waar staat wat

- `src/vandaag.ts`: gedeeld dagfilter en publicatietijden voor Worker en Pages.
- `src/`: frontend. `App.tsx` (hoofdscherm), `feed.tsx` (nieuwsfeed), `video.tsx` (spelers), `filters.tsx`, `beelden.tsx`/`beeld.ts` (foto's, ontdubbelen), `dedup.ts` (video's ontdubbelen), `buffer.ts` (bufferregels per netwerkniveau voor de videofeed; getest in `tests/buffer.test.ts`), `sources.ts`, `types.ts`.
- `functions/`: Pages Functions. `data.json.ts` (merge KV `uur` + statische data; exporteert `merge`, getest), `samenvatting.ts` (video-samenvatting, POST; eist JSON-Content-Type, weigert vreemde Origin, cachet ook fouten, `why` alleen bij `pre:true`), `meer.ts` ("Lees verder"), `media/dumpert/[[path]].ts` (HLS-proxy).
- `worker/src/`: `index.ts` (cron, Durable Objects `Runner`/`Fetcher`, endpoints), `budget.ts` (Durable Object `Budget`), `ai.ts` (modellen en tarieven), `parse.ts` (feedparser), `videos.ts`, `x.ts`, `redlib.ts`, `weer.ts` (landelijk weer voor heel Nederland: Buienradar-landstations, Open-Meteo noord/midden/zuid, KNMI-tekst en -waarschuwingsregel; `simpelWeer` blijft één AI-aanroep, prompt "heel Nederland", invoer max 1500 tekens; geen Haarlem-focus, de rubriek Haarlem is los daarvan), `artikel.ts`, `vooraf.ts` (video-samenvattingen vooraf).
- `scripts/`: `build-bronnen.mjs`, `fix-dumpert.mjs`, `add-beelden.mts`, `dhash.py`. `export_from_canvas.mjs` in de root.
- `tests/`: één `*.test.ts` per onderwerp, o.a. `dedup.test.ts` (video-ontdubbelen), `beeld-ontdubbelen.test.ts`, `data-merge.test.ts` (`merge` + `schoon`), `links.test.ts`, `externe-url.test.ts`, `beveiligingsheaders.test.ts`, `laadprestaties.test.ts`, `samenvatting-slot.test.ts`, `kv-schrijven.test.ts`, `run-status.test.ts`, `deploy-integriteit.test.ts`, `stall.test.ts` voor videoherstel en `sources.test.ts` + `sources-hooks.test.ts` (bronnenfilter; de hooks draaien via `react-dom/client` en `act` met minimale window-/container-stubs en gemockte `fetch`/`localStorage`, zonder DOM-bibliotheek).
- `worker/src/cluster.ts`: clusteren van feedberichten (pure module).

## Conventies

- TypeScript, ES modules, 2 spaties inspringen, dubbele quotes, puntkomma's. Compacte, dichte stijl; bestaande bestanden zijn het voorbeeld.
- Commentaar in het Nederlands, kort, vooral het *waarom* (bovenaan een bestand wat het doet). Namen mogen Nederlands zijn (`beeld`, `bronnen`, `schoon`).
- Functions en Worker hebben eigen kleine interfaces (`KV`, `Env`, `Ctx`) naast `@cloudflare/workers-types` in de Worker (`worker/package.json`, `worker/tsconfig.json`); houd ze klein en volg dat.
- Code gedeeld tussen frontend, Functions en Worker staat in `src/` (bijv. `slug.ts`, `beeld.ts`, `schoon.ts`) en wordt geïmporteerd.
- Worker draait op het Free plan: max 50 subrequests per aanroep. Ophalen gaat daarom in batches via Durable Object `Fetcher`. Houd daar rekening mee.
- Alle uitgaande verzoeken van de Worker gebruiken de UA `nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)` (uitzonderingen staan in de code, bijv. Reddit en AD).
- De Nederlandse-broncheck voor de fallback zonder AI staat in `src/bronlink.ts`; houd deze defensief voor relatieve en ongeldige feedlinks.
- Externe `href`'s in de UI altijd via `veiligeUrl()` (`src/url.ts`); feed-links in de Worker via `absUrl()` (`worker/src/parse.ts`). Geen `javascript:`-links.
- Nieuwe test: voeg een `t("...", () => {...})` toe in het `tests/<onderwerp>.test.ts` dat erbij past, of maak een nieuw bestand; `npm test` pakt elk `*.test.ts` vanzelf op.
- Tijd: `src/tijd.ts` deelt de Amsterdamse middernachtberekening met de Worker (ook op DST-wisseldagen). Filters gebruiken `gegenereerd` als referentiedag met 20 minuten toekomstmarge; relatieve filters rekenen tegen nu. Regressietests staan in `tests/filters.test.ts`.

## Caching

`/data.json` hervalideert altijd: de client haalt hem op met `cache: "no-cache"` zonder `?t=`-cachebuster, `functions/data.json.ts` geeft een zwakke ETag en 304 bij `If-None-Match` en `Cache-Control: max-age=0, must-revalidate, stale-while-revalidate=300`. Geen lange `max-age` zetten: de uurdata moet direct vers zijn. `/assets/*` is immutable; `/bronnen.json` en iconen staan in `public/_headers`. `slim()` strip diagnosevelden uit de respons; voeg alleen velden toe als de client ze echt leest.

## Laadprestaties (#35)

`index.html` start `/data.json` al tijdens het parsen (`window.__vroegData`, overgenomen door `useData` via `src/vroeg.ts`); een wijziging aan dat inline script vraagt een nieuwe CSP-hash. Inter staat self-hosted in `public/fonts/` (geen Google Fonts; `font-src 'self'`). `NewsFeed` mount de inhoud van kaarten alleen rond de huidige positie (`KAARTEN_VOORAF`/`KAARTEN_VOORUIT`); lege kaarten houden dezelfde hoogte, `data-id` en `aria-label`. Zie [architectuur](docs/architectuur.md#laadprestaties-35).

## Clusteren

Pure module `worker/src/cluster.ts` (`toks`, `sim`, `gelijk`, `cluster`) clustert feedberichten; getest in `tests/cluster.test.ts`. Titeltokens met lichte NL-stam, synoniemen (verbod/verbieden, basisschool/basisonderwijs), hulpwerkwoorden (wil, gaat, moet…) als stopwoord en hoofdletter-acroniemen van 2 letters (AI, EU, VN; niet in titels helemaal in kapitalen). Samen als overlap ≥2 woorden met Jaccard ≥0,45 (zonder acroniemen) of ≥4 woorden met Jaccard ≥0,3; minstens 1 (voor de ruime regels 2) gedeeld woord buiten de lijst `ALGEMEEN` (jaartallen en postcodedelen tellen niet). Een kandidaat wordt met elk clusterlid afzonderlijk vergeleken (max over leden, niet met de unie van de tokens) en voegt alle clusters samen waar hij bij past. Beschrijving alleen als extra bewijs: bij ≥2 eigen titelwoorden streng (≥8 woorden, Jaccard ≥0,5), of bij 1 eigen woord + gedeeld acroniem (AI, EU) + ≥2 gedeelde titelwoorden (≥9 woorden, Jaccard ≥0,25). Conservatief houden. Naspelen op echte data: `tests/live-cluster.ts`, feeds ophalen met `scripts/feedtitels.mts`.

## Vooraf laden (Filmpjes/Dumpert)

Vooraf laden (issue #34): `src/voorladen.ts` (pure keuzelogica + runner), `src/usevoorladen.ts` (hook in `App.tsx`). Alleen na `load` + idle, alleen als het tabblad zichtbaar is en je niet al op een video-route zit; alles `priority: low`, hooguit 3 requests tegelijk, één keer per sessie (opnieuw alleen bij nieuwe `gegenereerd`). Geen AI, geen `/samenvatting`, geen `/meer`. Wijzig `feed.tsx`-`warmHls` en dit samen als de HLS-logica verandert (de code is bewust gedupliceerd).

Op alle verbindingen, ook mobiele data en Save-Data: 6 thumbnails per tab, hls.js-chunk (niet op Safari), 2 HLS-streams via de proxy (master, laagste variant, 2 segmenten) en de eerste ~256 KB van de eerste mp4. Past binnen de CSP (`img-src https:`, `connect-src https:`).

## Rubriek Buitenland

Geen feedgroep: `src/regio.ts` (pure module, ook in de Worker) deelt cat `nl` achteraf in via `isBuitenland()`/`herindeel()`. Regels: per bron een signaal (`bronSignaal`: buitenlandfeed of heel padsegment `/buitenland/`, `/world/` = buiten (nooit substring van een slug); `/binnenland/`, `/regio/`, `/politiek/` = binnen; sport/entertainment = neutraal); een Nederlands anker (`NL_ANKER`) in kop of ai houdt het bij Nederland; meer buiten dan binnen = Buitenland; zonder signaal en zonder neutrale bron beslist `BUITEN_WOORD`. De Worker houdt in `index.ts` een set `buitenL` bij met links uit feeds waarvan de URL `buitenland` bevat, en herindeelt na het bouwen van de items (clusters en AI-selectie blijven `nl`). De frontend roept `herindeel` aan bij het laden (`App.tsx`); `src/sources.ts` telt Buitenland onder bronnengroep `nl`. Alleen cat `nl` wordt aangeraakt. Tests: `tests/regio.test.ts`.

## Externe artikel-URL's

Gebruik `worker/src/url.ts` voor og/artikel-fetches en controleer feedlinks vóór Jina en jobselectie. Alleen HTTP(S), poort 80/443 en geen IP-literals of lokale/interne hostnamen. Controleer ook de redirect-eind-URL; tests gebruiken fetch-mocks.

## Videofeed vooruit bufferen

`src/buffer.ts` bepaalt de HLS-buffergrenzen voor de actieve en volgende speler. De vaste pool bewaart drie video-elementen en maximaal twee bronnen; verder vooruit worden geen spelers gebufferd.

## Neuronbudget (AI-wijzigingen)

`BUDGET`=9000 neuronen/dag, `CAP`=40 nieuwe samenvattingen per run. Tiers in `worker/src/index.ts`:

- < 70%: hoofdmodel (`MODEL`, gemma-4-26b), max 40 per run
- 70–90%: klein model (`SMALL_MODEL`, llama-3.2-1b), max 15 per run
- 90–100%: alleen NL en Haarlem, max 8
- ≥ 100%: geen AI, feedtekst met `ruw: true`

Video-samenvattingen vooraf stoppen vanaf 85%; AI-uitleg voor "Lees verder" alleen onder 65%. Elke nieuwe AI-aanroep moet hierin passen: tel neuronen mee (zie `worker/src/ai.ts`), cache het resultaat in KV zodat iets maar één keer gemaakt wordt, en test niet in een lus tegen echte AI.

## Beveiligingsheaders

Bij wijzigingen aan het inline thema-script in `index.html`: werk de SHA-256-hash in `public/_headers` bij (inclusief witruimte). De tests bewaken deze koppeling. Pages Functions vallen buiten `_headers` en moeten zelf `nosniff` blijven zetten. Zie [architectuur](docs/architectuur.md#beveiligingsheaders).

### Budget-DO (`/samenvatting`)

De Durable Object `Budget` (`worker/src/budget.ts`, logica in `src/budget.ts`, binding `BUDGET_DO`, migratie `v2`) is de enige eigenaar van het slot per video, de video-neuronen per dag en de Whisper-rem (`MAX_WHISPER_UUR` = 30). Reserveren gebeurt atomair vóór `env.AI.run`, verrekenen met het echte verbruik erna; houd dat zo bij elke wijziging aan video-AI. De DO spiegelt het dagtotaal naar KV `vid-neurons:<datum>` (de uur-Worker leest dat); zonder binding valt `functions/samenvatting.ts` terug op KV. Deploy: Worker vóór Pages (de Pages-binding heeft de klasse nodig; `deploy.sh` doet dat). Workers Issues staat aan via `[observability.issues]` in `worker/wrangler.toml`.

### KV-schrijflimiet uur-Worker

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

Videopool (#50): `Feed` heeft 3 vaste `<video>`'s (slot = index % 3, `src/videopool.ts`); wissel alleen de bron, maak of verwijder nooit een `<video>` tijdens swipen. Niet op een echte iPhone geverifieerd.

Direct starten (#51): de volgende speler staat vooraf in de slide en start direct bij swipen. De poster blijft zichtbaar tot er beelddata is. De vaste pool houdt maximaal twee bronnen actief, ook bij mobiele data en Save-Data. `src/buffer.ts` begrenst de volgende hls.js-speler op 12 s / 4 MB (ruim), 6 s / 2 MB (mobiel of 3g) of 2 s / 1 MB (Save-Data of 2g); de actieve speler krijgt 30 s / 60 MB. Hele HLS-segmenten kunnen de grenzen overschrijden. Native HLS en mp4 gebruiken preload=auto en volgen deze limieten niet. Niet op een echte iPhone geverifieerd.

Video-debug (#50): open `/?debug=1#/dumpert` voor de verborgen diagnose-overlay; alternatief: zet localStorage `nieuwsinkort-debug` op `1`. De overlay toont spelers, balkstand en recente media-events.

Geluid (#66): `src/geluid.ts` onthoudt de keuze voor filmpjes, shorts en Dumpert in sessie- en localStorage, met een geheugenfallback. Bij een gebruikersgebaar worden alle drie poolelementen vrijgegeven; weigert autoplay geluid, dan verschijnt „Tik voor geluid” zonder de keuze te wissen. YouTube krijgt de keuze via zijn iframe. Dit is nog niet op een echte iPhone geverifieerd.
