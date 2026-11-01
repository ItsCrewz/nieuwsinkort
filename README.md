# nieuwsinkort

Mobiele nieuwssite in het Nederlands ("Nieuws in het kort"), gemaakt voor iPhone Safari. Nieuws per rubriek (Nederland, Buitenland, Politiek, Voetbal, Formule 1, Auto, Sport, Tech, Haarlem, Showbizz; lege rubrieken worden verborgen) met ontdubbelde berichten uit meerdere bronnen, korte AI-samenvatting in eenvoudig Nederlands voor volwassenen (ongeveer B1; zinnen liefst hooguit 15 woorden, nooit meer dan 20), "In het kort", landelijk weer (heel Nederland, bron KNMI), fotocarrousels en Filmpjes/Dumpert (journaals, shorts): op touchschermen een verticale swipe-feed, op desktop (muis/trackpad) de gewone weergave met kopjes, tabbladen en kaarten; een kaart opent daar het filmpje bij de bron.

Video-samenvattingen gebruiken met de Pages-secret `GROQ_API_KEY` Groq voor transcriptie en punten; bij ontbrekende sleutel of uitputting volgt de bestaande Cloudflare-route binnen het budget. Groq-tellers in KV zijn een rem zonder atomaire garantie.

- Live: https://nieuwsinkort.pages.dev (Cloudflare Pages-project `nieuwsinkort`). Productiedomein: https://nieuwsinkort.nl; www.nieuwsinkort.nl geeft een 301 naar de apex (`functions/_middleware.ts`).

De metadata in `index.html` beschrijft de website en nieuwsorganisatie met JSON-LD; het logo verwijst naar `public/icon-512.png`.

## Stack

Vite 8, React 18, TypeScript 5, Tailwind 3, hls.js. Backend op Cloudflare: Pages Functions (`functions/`), Worker `nieuwsinkort-uur` (`worker/`) met Durable Objects (`Runner`, `Fetcher`, `Budget`), KV en Workers AI. Tekst-AI valt bij fouten zo nodig terug op Groq en daarna Mistral; zie [AI-aanbieders en secrets](docs/ai-aanbieders.md).

## Filters

Onbekende paden geven op Cloudflare Pages een 404 met `public/404.html`; de app gebruikt hash-routes en deeplinks blijven onder `/`. Controleer een Pages-preview of productie met `node scripts/check-status.mjs <basis-url>`. De controle gebruikt veilige foutverzoeken voor Functions en start geen AI.

Home toont het landelijke weerbericht en alle artikelen; op andere tabs staat geen weerbericht. De routes `#/`, een lege hash en de oude route `#/alles` openen Home; ook `#/bericht/<slug>` opent een bericht vanuit Home.

Filter artikelen op tijd, rubriek (bij Home), regio, video en meerdere bronnen.
Kies bij Volgorde voor Nieuwste eerst (standaard), Oudste eerst of Meeste bronnen.
Bij Nieuwste eerst staat het openingsartikel met de meeste bronnen bovenaan, gevolgd door de overige artikelen op tijd.
Bij Oudste eerst en Meeste bronnen geldt de gekozen volgorde ook voor het openingsartikel.
Je filters worden in localStorage onthouden.
Vandaag begint om middernacht in Amsterdam, ook op zomer- en wintertijdwisseldagen. Artikelen en video's van eerdere dagen verdwijnen dan, ook vóór de eerste uurrun; Dumpert valt niet terug op gisteren. Berichttijden gebruiken de dag van `gegenereerd` met 20 minuten toekomstmarge; Laatste uur en Laatste 3 uur rekenen vanaf nu.

## Indeling

| Map / bestand | Inhoud |
|---|---|
| `src/` | Frontend (React, feed, filters, video, ontdubbelen, `buffer.ts` = bufferregels voor de videofeed) |
| `functions/` | Pages Functions: `data.json.ts`, `samenvatting.ts`, `meer.ts`, `media/dumpert/[[path]].ts` |
| `worker/` | Uur-Worker `nieuwsinkort-uur` (eigen `package.json` en `wrangler.toml`) |
| `scripts/` | Hulpscripts (bronnenlijst, Dumpert-fix, foto's/hash) |
| `public/` | Statische bestanden, o.a. `data.json` en `bronnen.json` |
| `prod-frozen/` | Bevroren oude productiebuild (zie deploy) |
| `tests/` | Alle `*.test.ts` draaien met `npm test`, waaronder `dedup.test.ts`, `extractief.test.ts`, `regio.test.ts`, `cluster.test.ts`, `cluster-randgevallen.test.ts`, `worker-hulpmodules.test.ts`, `x-artikel-foutpaden.test.ts`, `stall.test.ts`, `videopool.test.ts`, `sources.test.ts`, `sources-hooks.test.ts`, `ui-host.test.ts` en `preload-beeld.test.ts`; Pages Functions worden getest met lokale nep-KV en nep-AI; X-foutpaden gebruiken een lokale fetch-mock en de beeldpreloadtest een nep-`Image` zonder netwerk. De `*-randgevallen.test.ts`-bestanden testen onder meer randgevallen bij parsing, filters, tijd en URL's. `live-dedup.ts` en `live-cluster.ts` zijn handmatige checks op echte data |
| `deploy.sh`, `DEPLOY_BRANCH` | Deploy naar Cloudflare Pages (+ optioneel de Worker) |
| `export_from_canvas.mjs` | Oude flow (verlaten, komt niet terug): canvas-bron naar `public/data.json`, dat nu alleen nog fallback is |

Met `scripts/feedtitels.mts` zijn nieuwsfeeds voor het lokaal naspelen van clustering op te halen, inclusief Voetbal, Formule 1 en Auto. Buitenland wordt per bericht herkend uit Nederlandse feeds; YouTube, Instagram, Reddit en podcasts blijven uitgesloten. Het script schrijft alleen een lokaal JSON-bestand.

Buitenland is een rubriek, geen bronnengroep: de feedgroep `nl` bevat ook buitenlandfeeds, en `src/regio.ts` deelt berichten uit `nl` achteraf in. De Worker doet dit bij het bouwen van `uur`; de frontend past dezelfde `herindeel()` toe bij het laden, zodat ook statische en oude data kloppen. Regels: een buitenlandfeed of een heel URL-padsegment (`/buitenland/`, `/world/`; geen substring van een slug) telt als buiten, `/binnenland/`, `/regio/`, `/politiek/` als binnen; meer buiten dan binnen = Buitenland; een Nederlands anker in kop of samenvatting (Nederland, kabinet, Den Haag, enz.) houdt het bij Nederland; zonder signaal beslist een lijst landnamen (sport- en entertainmentpaden tellen niet mee). Bronnen van Buitenland-berichten tellen en schakelen onder groep Nederland in het Bronnen-paneel.

Bij de fallback zonder AI slaat de uurrun relatieve en ongeldige bronlinks over bij de controle op Nederlandse domeinen; andere bronnen blijven verwerkt worden.

Bij uitputting van de AI-ruimte of een tijdelijke AI-fout maakt `worker/src/extractief.ts` voor alle rubrieken een deterministische samenvatting: opgeschoonde kop (max 120 tekens, zonder "Podcast |", "LIVE" of HTML), de eerste 2–3 zinnen van de omschrijving (±50 woorden) en bij Engelse bronnen de eerste zin met het label "(Engels)". Zulke berichten hebben `ruw: true` en tonen "nog niet samengevat"; een latere run met AI vervangt ze. Politiek houdt zijn eigen regel.

## Vooraf laden

Na het laden van de pagina (en in idle-tijd) warmt de site op de achtergrond de eerste Filmpjes en Dumpert-video's op, zodat een klik op die tabs niet hoeft te wachten: thumbnails, de hls.js-chunk, het begin van geschikte streams en de eerste bytes van de eerste mp4. Dit gebeurt op alle verbindingen, ook bij mobiele data en Save-Data. Zie `src/voorladen.ts`; de richtwaarde voor het dataverbruik is ≈1,55 MB.

## Lokaal draaien

```bash
npm ci
npm run dev      # Vite dev-server
npm run lint     # ESLint (typescript-eslint, react-hooks); 0 errors, warnings zijn informatief
npm run check    # lint, tests, build, CSS- en HTML-lint, gzip-budget en typechecks voor Worker en Functions
npm run lint:css # Stylelint voor src/**/*.css
npm run lint:html # HTML-validatie van index.html en dist/index.html (na build)
npm run check:bronlinks # offline controle van bron-URL’s
npm test         # tests
npm run coverage # tests met Vitest en regeldekking per kritieke groep
npm run typecheck:tests  # typecheck van tests/ (los van build; vereist @types/node)
npm run build    # bronnen.json + tsc + vite build -> dist/
```

De TypeScript-controles voor frontend, Worker en Functions gebruiken `strict` en controleren ook ongebruikte declaraties en parameters en ontbrekende `break`-instructies in switches. De losse testtypecheck gebruikt een declaratie voor `react-dom/server.browser` in `tests/`.

Pages Functions lokaal (incl. Dumpert-proxy): `npx wrangler pages dev dist --port 4173`.
Worker lokaal: `cd worker && npm ci && npx wrangler dev --test-scheduled` met lokaal ingestelde `RUN_KEY`, dan `/run` en `/uur` met de header `Authorization: Bearer <RUN_KEY>`. Sleutels in queryparameters worden niet geaccepteerd. `force=1` geeft 429 als de laatste runstart minder dan tien minuten geleden was. Workers AI is altijd remote en kost dus echte neuronen.

## Deployen

> **Let op: deploys gebeuren alleen met uitdrukkelijke goedkeuring van Joey.** Voer zonder die goedkeuring geen `./deploy.sh`, `npm run deploy`, `wrangler deploy`, `wrangler pages deploy`, `wrangler secret` of `wrangler triggers` uit. Dit geldt ook voor agents.

- `./deploy.sh` bouwt en zet de site op Pages. De doelbranch staat in `DEPLOY_BRANCH`.
  - `main`: de nieuwe build gaat naar productie.
  - iets anders (bijv. `design`): productie krijgt de bevroren site uit `prod-frozen/` met verse `data.json`, de nieuwe build gaat alleen naar die preview-branch.
- De Worker deployen: `DEPLOY_WORKER=1 ./deploy.sh` of `cd worker && npx wrangler deploy`. De Worker moet vóór Pages: de Pages-binding `BUDGET_DO` (Durable Object `Budget`, migratie `v2`) verwijst naar de klasse in `nieuwsinkort-uur`; `deploy.sh` doet die volgorde al.
- `Budget` is de enige eigenaar van slot, video-neuronen en uurrem (30/uur) van `/samenvatting`; de DO spiegelt het dagtotaal naar KV `vid-neurons:<datum>` voor de uur-Worker. Zonder binding (lokaal/preview) valt de Function terug op KV. Foutmonitoring: Workers Issues staat aan in `worker/wrangler.toml` (`[observability.issues]`).
- Handige schakelaars: `DRY_RUN=1` (niets uploaden), `SKIP_BUILD=1`, `CANVAS_SRC=<pad>`, `FROZEN_BRANCH`, `FEEDS_JSON`.
- Inloggen via wrangler OAuth of `CLOUDFLARE_API_TOKEN`. Zet nooit tokens in de repo.

Artikel- en og-fetches en de Jina-terugval accepteren alleen HTTP(S)-links op poort 80/443, zonder IP-adressen of lokale/interne hostnamen. Resultaten met een geweigerde redirect-eind-URL worden weggegooid.

## Meer

- [docs/architectuur.md](docs/architectuur.md): architectuur, dataflow, bronnen, budget, open punten
- [docs/ai-budget.md](docs/ai-budget.md): meting van het Workers AI-verbruik (UTC-dag, echte `usage`, quotafouten, optionele env `NEURON_FACTOR`) en alle plekken die AI aanroepen
- [CLAUDE.md](CLAUDE.md): werkinstructies voor Claude Code
- [AGENTS.md](AGENTS.md): regels voor Codex en andere agents

## Changelog

Elke PR voegt een fragment `changelog.d/<issue>-<slug>.md` toe (onderdeel van "klaar"); `CHANGELOG.md` niet direct bewerken. De coördinator voegt de fragmenten vóór een release samen met `npm run changelog` (`-- --dry` toont een voorbeeld). Zie `changelog.d/README.md`.

## Laadprestaties

`/data.json` wordt vanuit `index.html` al tijdens het parsen opgehaald, het lettertype Inter wordt zelf geserveerd (`public/fonts/`, OFL) en de feed mount kaartinhoud pas rond de huidige kaart. Details en meetresultaten: [architectuur](docs/architectuur.md#laadprestaties-35).

## Beveiligingsheaders

Statische bestanden krijgen via `public/_headers` HSTS met `max-age=86400`, een CSP (fonts alleen van eigen origin), frameblokkering en Permissions-Policy. De HTML verwijdert de CORS-header; `/data.json` gebruikt dezelfde origin en de Function behoudt haar eigen CORS-header. Pages Functions krijgen de headers uit `_headers` niet automatisch; de vier Functions zetten zelf `X-Content-Type-Options: nosniff`. Cacheheaders voor `/data.json` worden door de Function bepaald (ETag/304, altijd hervalideren); `/assets/*` is immutable, `/bronnen.json` en de iconen hebben in `_headers` een korte cache met stale-while-revalidate. Zie [architectuur](docs/architectuur.md#beveiligingsheaders) voor onderhoud en lokale controle.

De CSP staat het Cloudflare Web Analytics-script van `static.cloudflareinsights.com` toe, zodat de door Cloudflare ingevoegde beacon kan werken. `cloudflareinsights.com` staat expliciet bij `connect-src`; HTTPS-verbindingen waren daar al toegestaan. De beacon zelf staat niet in `index.html`: Cloudflare voegt hem bij een deploy in zodra Web Analytics aan staat (zie [Bezoekersstatistieken](#bezoekersstatistieken-cloudflare-web-analytics)).

## Bezoekersstatistieken (Cloudflare Web Analytics)

Web Analytics staat aan via de Pages-instelling (Workers & Pages → nieuwsinkort → Metrics → Web Analytics); in de code is niets ingebouwd. Gemeten worden visits, paginaweergaven, laadtijd en Core Web Vitals (LCP, INP, CLS), met filters op onder meer land, pad, verwijzer en apparaat. Kosten: €0. Er zijn geen cookies, geen localStorage en geen fingerprinting; volgens Cloudflare worden geen persoonsgegevens van bezoekers verzameld (niet juridisch getoetst). Adblockers blokkeren de beacon, dus de cijfers zijn een ondergrens. Hash-routes (`#/filmpjes`, `#/sport`) worden niet apart geteld: alle bezoeken verschijnen als `/`. Bekijken: Cloudflare-dashboard → Web Analytics → de site. Uitzetten: dezelfde instelling uitschakelen en daarna één gewone deploy. Details: [architectuur](docs/architectuur.md#bezoekersstatistieken).

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

Direct starten (#51): de volgende speler staat vooraf in de slide en start direct bij swipen. De poster blijft zichtbaar tot er beelddata is. De vaste pool houdt maximaal twee bronnen actief, ook bij mobiele data en Save-Data. `src/buffer.ts` begrenst de volgende hls.js-speler op 12 s / 4 MB (ruim), 6 s / 2 MB (mobiel of 3g) of 2 s / 1 MB (Save-Data of 2g); de actieve speler krijgt 30 s / 60 MB. Hele HLS-segmenten kunnen de grenzen overschrijden. Native HLS en mp4 gebruiken preload=auto en volgen deze limieten niet. Niet op een echte iPhone geverifieerd.

Video-debug (#50): open `/?debug=1#/dumpert` voor de verborgen diagnose-overlay; alternatief: zet localStorage `nieuwsinkort-debug` op `1`. De overlay toont spelers, balkstand en recente media-events.

Nieuwsberichten krijgen een samenvatting van 2–3 korte zinnen en hooguit twee aanvullende punten. De Worker hergebruikt samenvattingen via bronlinks en via een rubriekgebonden titelwoordenset, maximaal 24 uur; dit beperkt AI-uitvoer en nieuwe aanvragen.

Geluid (#66): `src/geluid.ts` onthoudt de keuze voor filmpjes, shorts en Dumpert in sessie- en localStorage, met een geheugenfallback. Bij een gebruikersgebaar worden alle drie poolelementen vrijgegeven; weigert autoplay geluid, dan verschijnt „Tik voor geluid” zonder de keuze te wissen. YouTube krijgt de keuze via zijn iframe. Sinds #437 geldt de blokkade per bron (een geblokkeerde YouTube-slide dempt Dumpert en Instagram niet) en geldt „getikt” per document; zie [architectuur](docs/architectuur.md). Dit is nog niet op een echte iPhone geverifieerd.

Browserrookproeven staan beschreven in [docs/browser-tests.md](docs/browser-tests.md).

Focus lezen (#383): `src/focuslezen.ts` — standaard uit; alleen een expliciete klik wordt bewaard in localStorage-sleutel `nieuwsinkort-focus-lezen-keuze` (waarden `aan`/`uit`). De oude sleutel `dagelijks-nieuws-focus-lezen-v2` werd volgens de git-historie alleen bij een klik geschreven, maar wordt genegeerd en opgeruimd (een oude waarde kan niet van een standaard worden onderscheiden). De beginstand wordt lazy gelezen, dus geen flits. Zonder of met falende storage: uit. Tests: `tests/focuslezen.test.ts`.

Bij het afdrukken van een bericht verdwijnen navigatie, bediening en media. De tekst is zwart op wit en bij bronlinks staat de URL.
