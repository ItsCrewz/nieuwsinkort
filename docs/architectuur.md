# Architectuur

Alles draait op Cloudflare (Free plan). Geen eigen server.

```
 bronnen (RSS, hnrss, X, YouTube, Instagram, Dumpert, Reddit/Redlib, weer)
        │  elk uur 06–23 (Amsterdam)
        ▼
 Worker nieuwsinkort-uur ── DO Fetcher (ophalen in batches)
   DO Runner (run, budget, state) ── Workers AI (samenvatten)
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

Vite 5, React 18, TypeScript, Tailwind 3, hls.js. Mobiele feed in TikTok-stijl met fotocarrousels, filters (tijd, rubriek, regio, video, samengevoegd, volgorde), Bronnen-paneel, en een videofeed (max 2 spelers tegelijk, waakhond die herlaadt bij 2,5 s zonder nieuw beeld, geluid standaard aan via localStorage). Video: YouTube via nocookie-iframe, HLS native of via hls.js, MP4 via `<video>` (met `referrer=no-referrer` voor video.twimg.com). Ontdubbelen van video's en foto's: `dedup.ts`, `beeld.ts`. Het bouwen draait eerst `scripts/build-bronnen.mjs` (`public/bronnen.json`).

Volgorde: Nieuwste eerst (standaard), Oudste eerst of Meeste bronnen. Bij Nieuwste eerst staat het openingsartikel met de meeste bronnen bovenaan; bij de andere opties volgt ook het openingsartikel de gekozen volgorde.

## Pages Functions (`functions/`)

- `data.json.ts`: haalt het statische `data.json` (ASSETS) en KV `uur`, voegt ze samen (`merge`): routine-samenvattingen blijven, nieuwe berichten van het uur komen bovenaan, weer/filmpjes/Dumpert worden ververst. Uur-data van een andere dag wordt genegeerd. `?statisch=1` geeft alleen het statische bestand. Voegt ook `sv-klaar` (vooraf gemaakte video-samenvattingen) toe. Cache 300 s.
- `samenvatting.ts`: `POST /samenvatting {id}`, samenvatting van één filmpje (alleen filmpjes die op de site staan). Tekst via YouTube-ondertiteling of Whisper, daarna samenvatten. Cache in KV (`vs:<id>`). Bewaakt het gedeelde dagbudget.
- `meer.ts`: `GET /meer?k=<sleutel>`, extra tekst voor "Lees verder" uit KV `meer` (artikeltekst, AI-uitleg, kernpunten per bron), anders 404.
- `media/dumpert/[[path]].ts`: GET/HEAD-proxy naar media.dumpert.nl voor HLS (CORS staat daar alleen dumpert.nl toe).

Bindings in `wrangler.toml`: KV `NIEUWS` en Workers AI `AI`.

## Worker `nieuwsinkort-uur` (`worker/`)

- Enige cron: `0 4-22 * * *` (UTC); de tijdelijke cron `13 13 * * *` is verwijderd. `scheduled()` slaat uren buiten 06–23 Amsterdam over (zomer- en wintertijd). `workers_dev = false`.
- Durable Objects (sqlite): `RUNNER` (klasse `Runner`: de uurrun, budget, state, alarm voor video-samenvattingen vooraf) en `FETCHER` (klasse `Fetcher`: ophalen in batches, eigen limiet van 50 subrequests per instantie).
- KV `NIEUWS`. Resultaat van de run staat onder `uur` (items, filmpjes, dumpert, weer, bronstats, meta). Verder o.a. `meer`, `sv-klaar`, `vooraf-log`, `vs:<id>`, `og:<genormaliseerde-url>` (og:image, 3 dagen), `vid-neurons:<datum>` (neuronen van vandaag, gedeeld door Worker en `functions/samenvatting.ts`) en state.
- Endpoints: `/run?key=` (run starten, optioneel `force`), `/uur?key=` (KV `uur` als JSON), beide met secret `RUN_KEY`; `/status` (open, alleen meta + vooraf-log).
- Vars: `SITE`, `MODEL`, `CAP`, `BUDGET`, optioneel `SMALL_MODEL`. Secret: `RUN_KEY`.
- Stappen van een run: bronnen ophalen → berichten van vandaag ontdubbelen/clusteren → bestaande samenvattingen uit state hergebruiken → nieuwe clusters samenvatten (5 per prompt) → foto's (feed, anders og:image, 3 dagen gecachet) → "In het kort" en weertekst alleen bij gewijzigde invoer → "Lees verder"-tekst → `uur` schrijven → alarm: video-samenvattingen vooraf (`vooraf.ts`, roept `/samenvatting` aan met `pre:true`).
- "Lees verder": artikeltekst rechtstreeks ophalen (max 120 nieuwe artikelen per run). Bij minder dan 300 tekens volgt een tweede poging via r.jina.ai Reader (max 15 links per run, per link één keer geprobeerd volgens de state). `artikel.ts` zet de markdown om naar gefilterde alinea’s, zonder AI; bruikbare tekst wordt in state hergebruikt en via KV `meer` en `/meer` aangeboden. Geblokkeerde pagina’s kunnen ook via deze terugval zonder bruikbare tekst blijven.
- Onderdelen: `parse.ts` (RSS/Atom), `videos.ts` (Dumpert, YouTube-kanalen, Reddit-video's), `x.ts`, `redlib.ts`, `weer.ts`, `artikel.ts`, `ai.ts`.

### Workers AI en budget

Modellen: `@cf/google/gemma-4-26b-a4b-it` (`MODEL`, hoofd), `@cf/meta/llama-3.2-1b-instruct` (`SMALL_MODEL`), `@cf/openai/whisper-large-v3-turbo` (audio, max 3 min). Dagbudget `BUDGET`=9000 neuronen (gratis limiet 10.000), `CAP`=40 per run. Het budget wordt gedeeld door de Worker en `functions/samenvatting.ts`.

| Verbruik | Gedrag |
|---|---|
| < 70% | hoofdmodel, max 40 per run |
| 70–90% | klein model, max 15 per run |
| 90–100% | alleen NL en Haarlem, max 8 |
| 100% | geen AI; feedtekst met `ruw: true`, site meldt dat samenvatten even niet lukt |

Video-samenvattingen vooraf stoppen vanaf 85%; AI-uitleg voor "Lees verder" alleen onder 65%. Ondertiteling kost ±5 neuronen, Whisper ±44–133.

## Externe bronnen

Alle verzoeken met UA `nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)`, behalve waar de code een browser-UA nodig heeft (bijv. artikelpagina's, AD) of een feedlezer-UA (Reddit).

- **RSS**: lijst in `public/bronnen.json` (gebouwd uit `/workspace/nieuws/feeds.json`, zie `scripts/build-bronnen.mjs`).
- **Hacker News**: `hnrss.org/best` (news.ycombinator.com/rss geeft 419 aan Cloudflare).
- **X**: fxtwitter-API, terugval syndication. Tekstposts en video's van politieke accounts en Politie Haarlem.
- **YouTube**: kanaal-RSS (NOS, RTL, NU.nl e.a.) en ondertiteling. Geeft vanaf Cloudflare vaak LOGIN_REQUIRED; `functions/samenvatting.ts` onthoudt een mislukte samenvatting dan 3 uur per video; de kanaalfeeds blijven gewoon opgehaald worden.
- **Instagram**: profiel-embed, reels als filmpjes.
- **Dumpert**: toppers-pagina en HLS via de proxy (max 720p, H.264).
- **Reddit**: RSS (`top/.rss?t=day`) → old.reddit → Redlib-instances (roterend, HTML omgezet naar Atom) → laatste gelukte kopie van vandaag. Publieke Redlib-instances blokkeren Cloudflare nu vaak.
- **Weer**: Buienradar, Open-Meteo als terugval, KNMI-weerbericht en -waarschuwingen (Noord-Holland).
- **Overig**: openraadsinformatie (gemeenteraad), og:image van artikelpagina's.
- Lukt niet: BleepingComputer (403).

## Scripts

- `export_from_canvas.mjs`: canvas-bron → `public/data.json` (draait `fix-dumpert.mjs` en `add-beelden.mts`).
- `scripts/build-bronnen.mjs`: bouwt `public/bronnen.json` (env `FEEDS_JSON`, `FILMPJES_PY`; laat het bestaande bestand staan als `feeds.json` ontbreekt).
- `scripts/fix-dumpert.mjs`: zorgt voor afspeelbare Dumpert-embeds, laat items zonder video weg.
- `scripts/add-beelden.mts` + `dhash.py`: foto's per bericht (og:image, dubbele foto's weg via URL en perceptuele hash); cache in `scripts/.cache/` (genegeerd door git).
- `scripts/pipeline/`: scripts en bronnenbestanden uit PR #1, opgenomen in `main`.
- `tests/`: `dedup.test.ts` (ook beeld/schoon/merge) en `filters.test.ts` (beide via `npm test`), plus `live-dedup.ts` (handmatige check op echte data).

## Deploy

`deploy.sh` (zie README). `main` in het bestand `DEPLOY_BRANCH` (geen omgevingsvariabele; `deploy.sh` leest het bestand) zet de nieuwe build in productie; een andere waarde zet productie op de bevroren site `prod-frozen/` met verse data en de nieuwe build op een preview-branch. De Worker gaat apart (`DEPLOY_WORKER=1` of `wrangler deploy` in `worker/`). Alleen met goedkeuring van Joey.

## Domein

nieuwsinkort.nl staat bij STRATO en is **nog niet** aan het Pages-project gekoppeld. Plan: DNSSEC bij STRATO uit, nameservers naar Cloudflare, daarna nieuwsinkort.nl en www.nieuwsinkort.nl als custom domain aan het Pages-project toevoegen. Tot dan draait de site op nieuwsinkort.pages.dev (controleer bij de koppeling ook `public/robots.txt` en `public/sitemap.xml`).

## Open punten

- Domein koppelen (zie boven).
- Of `RUN_KEY` als Worker-secret is ingesteld, is niet vastgelegd; zonder werken `/run` en `/uur` niet (403).
- Redlib-instances blokkeren Cloudflare; Reddit valt daardoor soms terug op een oude kopie.
- YouTube geeft vaak LOGIN_REQUIRED vanaf Cloudflare.
- De bronnenlijst hangt af van `/workspace/nieuws/feeds.json` buiten de repo (staat op de gedeelde box in `/workspace/nieuws`; een kopie staat in `scripts/pipeline/` sinds PR #1).
