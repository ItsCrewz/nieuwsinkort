# Browserrookproef

Installeer na `npm ci` de browsers met `npx playwright install chromium firefox webkit` en draai `npm run e2e`. Playwright start lokaal Vite; externe verzoeken worden geblokkeerd. De proef gebruikt `public/data.json` en controleert vijf views op inhoud, browserfouten en axe-overtredingen met impact serious of critical. De emulaties gebruiken WebKit voor iPhone 15 en Chromium voor Pixel 7; dit vervangt geen test op echte telefoons.

De console-allowlist staat in `e2e/rookproef.spec.mjs`. Axe rapporteert aantallen per view en project. De baseline moet eerst lokaal worden gemeten: zolang een baseline `null` is, faalt de proef bewust. Leg per view het hoogste gemeten aantal van de vijf projecten vast en beoordeel veranderingen voordat de baseline wordt verhoogd. Deze proef maakt nog geen deel uit van `npm run check` zolang de baseline niet is vastgesteld.
