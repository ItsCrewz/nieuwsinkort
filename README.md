# nieuwsinkort.nl

Statische versie van het Dagelijks Nieuws-dashboard (Vite + React + TypeScript + Tailwind).

- Data: `public/data.json` (keys: datum, dag_samenvatting, weer, filmpjes, dumpert, items) wordt bij het laden opgehaald.
- Data verversen uit de canvas: `node export_from_canvas.mjs <canvas-bron.txt>` (schrijft public/data.json).
- Bouwen: `npm run build` -> `dist/`
- Lokaal testen incl. Dumpert-proxy: `npx wrangler pages dev dist --port 4173`
- Deployen: `CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./deploy.sh`
  (optioneel `CANVAS_SRC=<bestand>` om eerst data.json te verversen)

Video's: YouTube via youtube-nocookie-iframe, HLS (.m3u8) native in Safari/nieuwe Chrome, anders hls.js;
Dumpert-HLS loopt voor hls.js via de Pages Function `functions/media/dumpert/[[path]].ts`
(media.dumpert.nl staat alleen dumpert.nl toe via CORS). MP4 (X) via `<video>`; daarvoor staat
`<meta name="referrer" content="no-referrer">` (video.twimg.com weigert een vreemde referrer).

## Elk uur bijwerken (zonder LLM-routine)

- `worker/` = Cloudflare Worker **nieuwsinkort-uur** (Free plan). Cron `0 4-22 * * *` (UTC); de code draait alleen
  als het in Amsterdam 06:00–23:00 is, dus elk heel uur van 06:00 t/m 23:00, zomer- en wintertijd.
- De Worker haalt `bronnen.json` (feeds[] per bron), Dumpert-toppers, YouTube-nieuwskanalen, Reddit (achter elkaar,
  met pauzes), Buienradar/Open-Meteo/KNMI (zoals `weer.py`) op via Durable Objects (elk een eigen budget van 50
  subrequests). Alle verzoeken gaan met UA `nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)`.
- Berichten sinds 00:00 worden ontdubbeld en geclusterd. Clusters die al in de routine-data staan worden overgeslagen. Nieuwe clusters
  (max `CAP`=40 per run) worden door Workers AI (`@cf/google/gemma-4-26b-a4b-it`, denken uit) samengevat in simpel
  Nederlands, 5 per prompt. Samenvattingen staan per link in KV (`state`), dus elk bericht wordt maar één keer
  samengevat. "In het kort" en de weertekst worden alleen opnieuw gemaakt als de invoer veranderde. Er is een daglimiet van
  `BUDGET`=9000 neuronen (gratis: 10.000/dag). Is die op, dan gebruikt de Worker de feedtekst zelf (`ruw: true`).
- Resultaat: KV-sleutel `uur` (binding `NIEUWS`), met ook `bronstats` voor "Vandaag niets" in het Bronnen-paneel.
- `functions/data.json.ts` voegt `uur` samen met de statische `dist/data.json`. De samenvattingen van de routine blijven;
  nieuwe berichten komen bovenaan, en weer, filmpjes en Dumpert worden vervangen. Is `uur` niet van vandaag, of ontbreekt KV, dan
  gaat het statische bestand eruit. `?statisch=1` geeft altijd het statische bestand. Cache: `max-age=300`.
- Worker deployen: `cd worker && npm ci && npx wrangler deploy` (of `DEPLOY_WORKER=1 ./deploy.sh`).
  Het account heeft éénmalig een workers.dev-subdomein nodig (fout 10063): open daarvoor één keer
  Workers & Pages in het Cloudflare-dashboard. `workers_dev = false`, dus er komt geen publieke URL.
- Lokaal testen: `cd worker && npx wrangler dev --test-scheduled --var RUN_KEY:test`, daarna
  `curl 'localhost:8787/run?key=test'` (draai nu) en `curl 'localhost:8787/uur?key=test'` (resultaat).
  KV is lokaal gesimuleerd. Workers AI is altijd remote en telt dus mee voor de neuronen.
