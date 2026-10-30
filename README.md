# nieuwsinkort

Mobiele nieuwssite in het Nederlands ("Nieuws in het kort"), gemaakt voor iPhone Safari. Nieuws per rubriek (NL, Tech, Haarlem, Showbizz, Politiek) met ontdubbelde berichten uit meerdere bronnen, korte AI-samenvatting in simpel Nederlands, "In het kort", weer, fotocarrousels en een verticale videofeed (journaals, shorts, Dumpert).

- Live: https://nieuwsinkort.pages.dev (Cloudflare Pages-project `nieuwsinkort`). Het domein nieuwsinkort.nl is nog niet gekoppeld.

## Stack

Vite 8, React 18, TypeScript 5, Tailwind 3, hls.js. Backend op Cloudflare: Pages Functions (`functions/`), Worker `nieuwsinkort-uur` (`worker/`) met Durable Objects, KV en Workers AI.

## Filters

Filter artikelen op tijd, rubriek (bij Alles), regio, video en meerdere bronnen.
Kies bij Volgorde voor Nieuwste eerst (standaard), Oudste eerst of Meeste bronnen.
Bij Nieuwste eerst staat het openingsartikel met de meeste bronnen bovenaan, gevolgd door de overige artikelen op tijd.
Bij Oudste eerst en Meeste bronnen geldt de gekozen volgorde ook voor het openingsartikel.
Je filters worden in localStorage onthouden.

## Indeling

| Map / bestand | Inhoud |
|---|---|
| `src/` | Frontend (React, feed, filters, video, ontdubbelen) |
| `functions/` | Pages Functions: `data.json.ts`, `samenvatting.ts`, `meer.ts`, `media/dumpert/[[path]].ts` |
| `worker/` | Uur-Worker `nieuwsinkort-uur` (eigen `package.json` en `wrangler.toml`) |
| `scripts/` | Hulpscripts (bronnenlijst, Dumpert-fix, foto's/hash) |
| `public/` | Statische bestanden, o.a. `data.json` en `bronnen.json` |
| `prod-frozen/` | Bevroren oude productiebuild (zie deploy) |
| `tests/` | `dedup.test.ts` (draait met `npm test`), `live-dedup.ts` |
| `deploy.sh`, `DEPLOY_BRANCH` | Deploy naar Cloudflare Pages (+ optioneel de Worker) |
| `export_from_canvas.mjs` | Oude flow: canvas-bron naar `public/data.json` |

Bij de fallback zonder AI slaat de uurrun relatieve en ongeldige bronlinks over bij de controle op Nederlandse domeinen; andere bronnen blijven verwerkt worden.

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
- De Worker deployen: `DEPLOY_WORKER=1 ./deploy.sh` of `cd worker && npx wrangler deploy`.
- Handige schakelaars: `DRY_RUN=1` (niets uploaden), `SKIP_BUILD=1`, `CANVAS_SRC=<pad>`, `FROZEN_BRANCH`, `FEEDS_JSON`.
- Inloggen via wrangler OAuth of `CLOUDFLARE_API_TOKEN`. Zet nooit tokens in de repo.

Artikel- en og-fetches en de Jina-terugval accepteren alleen HTTP(S)-links op poort 80/443, zonder IP-adressen of lokale/interne hostnamen. Resultaten met een geweigerde redirect-eind-URL worden weggegooid.

## Meer

- [docs/architectuur.md](docs/architectuur.md): architectuur, dataflow, bronnen, budget, open punten
- [CLAUDE.md](CLAUDE.md): werkinstructies voor Claude Code
- [AGENTS.md](AGENTS.md): regels voor Codex en andere agents

## Beveiligingsheaders

Statische bestanden krijgen via `public/_headers` een CSP, frameblokkering en Permissions-Policy. De vier Pages Functions zetten zelf `X-Content-Type-Options: nosniff`; cacheheaders voor `/data.json` worden door de Function bepaald. Zie [architectuur](docs/architectuur.md#beveiligingsheaders) voor onderhoud en lokale controle.
