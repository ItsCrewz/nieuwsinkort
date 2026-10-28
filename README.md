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
