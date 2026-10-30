# nieuwsinkort

Video-samenvattingen gebruiken met de Pages-secret `GROQ_API_KEY` Groq voor transcriptie en punten; bij ontbrekende sleutel of uitputting volgt de bestaande Cloudflare-route binnen het budget. Groq-tellers in KV zijn een rem zonder atomaire garantie.


Mobiele nieuwssite in het Nederlands ("Nieuws in het kort"), gemaakt voor iPhone Safari. Nieuws per rubriek (Nederland, Buitenland, Politiek, Voetbal, Formule 1, Auto, Tech, Haarlem, Showbizz; lege rubrieken worden verborgen) met ontdubbelde berichten uit meerdere bronnen, korte AI-samenvatting in eenvoudig Nederlands voor volwassenen (ongeveer B1; zinnen liefst hooguit 15 woorden, nooit meer dan 20), "In het kort", landelijk weer (heel Nederland, bron KNMI), fotocarrousels en een verticale videofeed (journaals, shorts, Dumpert).

- Live: https://nieuwsinkort.pages.dev (Cloudflare Pages-project `nieuwsinkort`). Het domein nieuwsinkort.nl is nog niet gekoppeld.

## Stack

Vite 8, React 18, TypeScript 5, Tailwind 3, hls.js. Backend op Cloudflare: Pages Functions (`functions/`), Worker `nieuwsinkort-uur` (`worker/`) met Durable Objects (`Runner`, `Fetcher`, `Budget`), KV en Workers AI.

## Filters

Filter artikelen op tijd, rubriek (bij Alles), regio, video en meerdere bronnen.
Kies bij Volgorde voor Nieuwste eerst (standaard), Oudste eerst of Meeste bronnen.
Bij Nieuwste eerst staat het openingsartikel met de meeste bronnen bovenaan, gevolgd door de overige artikelen op tijd.
Bij Oudste eerst en Meeste bronnen geldt de gekozen volgorde ook voor het openingsartikel.
Je filters worden in localStorage onthouden.
Vandaag begint om middernacht in Amsterdam, ook op zomer- en wintertijdwisseldagen. Artikelen en video's van eerdere dagen verdwijnen dan, ook vóór de eerste uurrun; Dumpert valt niet terug op gisteren. Berichttijden gebruiken de dag van `gegenereerd` met 20 minuten toekomstmarge; Laatste uur en Laatste 3 uur rekenen vanaf nu.

## Indeling

| Map / bestand | Inhoud |
|---|---|
| `src/` | Frontend (React, feed, filters, video, ontdubbelen) |
| `functions/` | Pages Functions: `data.json.ts`, `samenvatting.ts`, `meer.ts`, `media/dumpert/[[path]].ts` |
| `worker/` | Uur-Worker `nieuwsinkort-uur` (eigen `package.json` en `wrangler.toml`) |
| `scripts/` | Hulpscripts (bronnenlijst, Dumpert-fix, foto's/hash) |
| `public/` | Statische bestanden, o.a. `data.json` en `bronnen.json` |
| `prod-frozen/` | Bevroren oude productiebuild (zie deploy) |
| `tests/` | `dedup.test.ts`, `extractief.test.ts`, `regio.test.ts`, `cluster.test.ts`, `stall.test.ts` (draaien met `npm test`), `live-dedup.ts`, `live-cluster.ts` (naspelen op echte data) |
| `deploy.sh`, `DEPLOY_BRANCH` | Deploy naar Cloudflare Pages (+ optioneel de Worker) |
| `export_from_canvas.mjs` | Oude flow: canvas-bron naar `public/data.json` |

Buitenland is een rubriek, geen bronnengroep: de feedgroep `nl` bevat ook buitenlandfeeds, en `src/regio.ts` deelt berichten uit `nl` achteraf in. De Worker doet dit bij het bouwen van `uur`; de frontend past dezelfde `herindeel()` toe bij het laden, zodat ook statische en oude data kloppen. Regels: een buitenlandfeed of een heel URL-padsegment (`/buitenland/`, `/world/`; geen substring van een slug) telt als buiten, `/binnenland/`, `/regio/`, `/politiek/` als binnen; meer buiten dan binnen = Buitenland; een Nederlands anker in kop of samenvatting (Nederland, kabinet, Den Haag, enz.) houdt het bij Nederland; zonder signaal beslist een lijst landnamen (sport- en entertainmentpaden tellen niet mee). Bronnen van Buitenland-berichten tellen en schakelen onder groep Nederland in het Bronnen-paneel.

Bij de fallback zonder AI slaat de uurrun relatieve en ongeldige bronlinks over bij de controle op Nederlandse domeinen; andere bronnen blijven verwerkt worden.

Zonder AI (dagruimte op, mislukte aanroep) maakt `worker/src/extractief.ts` voor alle rubrieken een deterministische samenvatting: opgeschoonde kop (max 120 tekens, zonder "Podcast |", "LIVE" of HTML), de eerste 2–3 zinnen van de omschrijving (±50 woorden) en bij Engelse bronnen de eerste zin met het label "(Engels)". Zulke berichten hebben `ruw: true` en tonen "nog niet samengevat"; een latere run met AI vervangt ze. Politiek houdt zijn eigen regel.

## Lokaal draaien

```bash
npm ci
npm run dev      # Vite dev-server
npm test         # tests
npm run build    # bronnen.json + tsc + vite build -> dist/
```

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

## Laadprestaties

`/data.json` wordt vanuit `index.html` al tijdens het parsen opgehaald, het lettertype Inter wordt zelf geserveerd (`public/fonts/`, OFL) en de feed mount kaartinhoud pas rond de huidige kaart. Details en meetresultaten: [architectuur](docs/architectuur.md#laadprestaties-35).

## Beveiligingsheaders

Statische bestanden krijgen via `public/_headers` een CSP (fonts alleen van eigen origin), frameblokkering en Permissions-Policy. De vier Pages Functions zetten zelf `X-Content-Type-Options: nosniff`; cacheheaders voor `/data.json` worden door de Function bepaald (ETag/304, altijd hervalideren); `/assets/*` is immutable, `/bronnen.json` en de iconen hebben in `_headers` een korte cache met stale-while-revalidate. Zie [architectuur](docs/architectuur.md#beveiligingsheaders) voor onderhoud en lokale controle.

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

Tekst-AI gebruikt Workers AI en, als de sleutel is ingesteld, Groq en daarna Mistral als fallback. Zie [AI-aanbieders en secrets](docs/ai-aanbieders.md).
