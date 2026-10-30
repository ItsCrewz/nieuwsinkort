# AGENTS.md

Regels voor Codex en andere agents in deze repo (nieuwsinkort, Nederlandstalige nieuwssite op Cloudflare). Meer detail: [CLAUDE.md](CLAUDE.md), [README.md](README.md), [docs/architectuur.md](docs/architectuur.md). Dit bestand is zelfstandig leesbaar voor de regels.

## Regels

1. **Nooit deployen zonder uitdrukkelijke goedkeuring van Joey.** Niet draaien: `./deploy.sh`, `npm run deploy`, `wrangler deploy`, `wrangler pages deploy`, `wrangler secret`, `wrangler triggers`. Eenmalige goedkeuring geldt niet voor latere deploys.
2. **Geen secrets committen**: `.env`, `.dev.vars`, tokens, API-keys, de waarde van `RUN_KEY`, cookies. Variabelenamen in docs zijn prima.
3. **Werk op een branch + PR.** Nooit pushen naar `main`, niets mergen zonder Joey.
4. **Draai `npm test` één keer aan het eind**, niet per stap.
5. **Neuronbudget Workers AI respecteren**: `BUDGET`=9000/dag (gratis limiet 10.000), `CAP`=40 per run. Tiers: <70% hoofdmodel, 70–90% klein model (max 15), 90–100% alleen NL/Haarlem (max 8), daarna geen AI (`ruw: true`). Cache AI-uitkomsten in KV, geen AI-aanroepen in lussen of tests.
6. Wijzig crons, bindings en vars (`wrangler.toml`, `worker/wrangler.toml`) en `DEPLOY_BRANCH` alleen als de taak dat vraagt.

## Artikel-fetches

Behoud de controle via `worker/src/url.ts` bij og/artikel/Jina-jobs: HTTP(S), poort 80/443, geen IP-literals of lokale/interne hostnamen. Geweigerde redirect-eind-URL's leveren geen resultaat op.

## Essentials

- Stack: Vite 8, React 18, TypeScript 5, Tailwind 3, hls.js; Cloudflare Pages Functions (`functions/`); Worker `nieuwsinkort-uur` (`worker/`, Durable Objects `Runner`/`Fetcher`/`Budget`, KV `NIEUWS`, Workers AI).
- Commando's: `npm ci`, `npm run dev`, `npm run build` (bronnen + tsc + vite), `npm test`.
- Indeling: `src/` frontend, `functions/` Pages Functions (`data.json.ts`, `samenvatting.ts`, `meer.ts`, `media/dumpert/`), `worker/src/` uur-Worker, `scripts/` hulpscripts, `tests/` tests, `public/` statisch (`data.json`, `bronnen.json`), `prod-frozen/` bevroren oude build.
- Stijl: TypeScript, ES modules, 2 spaties, dubbele quotes, puntkomma's; compacte code; commentaar in het Nederlands en kort (het waarom). Gedeelde code staat in `src/`. Functions en Worker gebruiken eigen kleine interfaces (`KV`, `Env`, `Ctx`); de Worker heeft daarnaast wel `@cloudflare/workers-types` (`worker/package.json`, `worker/tsconfig.json`).
- Worker draait op het Free plan: max 50 subrequests per aanroep, daarom batches via `Fetcher`.
- De fallback zonder AI gebruikt `src/bronlink.ts` voor een defensieve Nederlandse-broncheck; relatieve en ongeldige feedlinks mogen de uurrun niet laten crashen.
- Caching: `/data.json` altijd hervalideren (`fetch(..., {cache:"no-cache"})` zonder `?t=`), ETag/304 in `functions/data.json.ts`; niet terug naar een lange `max-age`, anders is de uurdata niet vers. Gehashte `/assets/*` immutable; `_headers` regelt `/bronnen.json` en iconen.
- Laden: `index.html` start `/data.json` vroeg (`src/vroeg.ts`), Inter staat self-hosted in `public/fonts/` (geen Google Fonts, CSP `font-src 'self'`), en `NewsFeed` mount kaartinhoud alleen rond de huidige kaart (`leeg`-secties houden de hoogte). Zie [architectuur](docs/architectuur.md#laadprestaties-35).
- Weer is landelijk (`worker/src/weer.ts`, plaats "Nederland"; Buienradar-landstations, Open-Meteo noord/midden/zuid, KNMI-tekst en landelijke waarschuwingsregel, bron KNMI). Geen Haarlem-focus in het weer en in de `simpelWeer`-prompt (één AI-aanroep, invoer max 1500 tekens); de rubriek Haarlem blijft ongemoeid. Test: `tests/worker.test.ts`.
- Rubriek Buitenland: geen feedgroep maar een indeling achteraf van cat `nl` in `src/regio.ts` (`isBuitenland`/`herindeel`: buitenlandfeed of heel URL-padsegment, Nederlands anker, landwoorden). De Worker past dit toe na het bouwen van de items, de frontend bij het laden van `data.json`; bron-telling en bron aan/uit rekenen Buitenland onder groep `nl`. Tests: `tests/regio.test.ts`.
- Clusteren van feedberichten: pure module `worker/src/cluster.ts` (`toks`, `sim`, `gelijk`, `cluster`), getest in `tests/cluster.test.ts`. Titeltokens met lichte NL-stam, synoniemen (verbod/verbieden, basisschool/basisonderwijs), hulpwerkwoorden (wil, gaat, moet…) als stopwoord en hoofdletter-acroniemen van 2 letters (AI, EU, VN; niet in titels helemaal in kapitalen). Samen als overlap ≥2 woorden met Jaccard ≥0,45 (zonder acroniemen) of ≥4 woorden met Jaccard ≥0,3; minstens 1 (voor de ruime regels 2) gedeeld woord buiten de lijst `ALGEMEEN` (jaartallen en postcodedelen tellen niet). Een kandidaat wordt met elk clusterlid afzonderlijk vergeleken (max over leden, niet met de unie van de tokens) en voegt alle clusters samen waar hij bij past. Beschrijving alleen als extra bewijs: bij ≥2 eigen titelwoorden streng (≥8 woorden, Jaccard ≥0,5), of bij 1 eigen woord + gedeeld acroniem (AI, EU) + ≥2 gedeelde titelwoorden (≥9 woorden, Jaccard ≥0,25). Conservatief houden. Naspelen op echte data: `tests/live-cluster.ts`, feeds ophalen met `scripts/feedtitels.mts`.
- Alle teksten (UI, docs, commits, commentaar) zijn Nederlands.
- Externe `href`'s in de UI altijd via `veiligeUrl()` (`src/url.ts`); feed-links in de Worker via `absUrl()` (`worker/src/parse.ts`).
- Worker-endpoints `/run` en `/uur`: gebruik `Authorization: Bearer <RUN_KEY>`, nooit een URL-sleutel. `force=1` wordt binnen tien minuten na de laatste runstart geweigerd. Test dit zonder echte AI-aanroepen.
- Tijdlogica: gedeelde Amsterdamse middernacht in `src/tijd.ts`; test DST en de referentiedag `gegenereerd` in `tests/filters.test.ts`. Relatieve filters blijven tegen nu rekenen, berichttijden hebben 20 minuten toekomstmarge.

## Beveiligingsheaders

Houd de CSP-hash in `public/_headers` gelijk aan de exacte inhoud van het inline thema-script in `index.html`. Pages Functions zetten zelf `X-Content-Type-Options: nosniff` (ook bij foutantwoorden); `_headers` geldt alleen voor statische bestanden. Laat `prod-frozen/_headers` ongemoeid zolang die build niet gebruikt wordt.

### Budget-DO (`/samenvatting`)

De Durable Object `Budget` (`worker/src/budget.ts`, logica in `src/budget.ts`, binding `BUDGET_DO`, migratie `v2`) is de enige eigenaar van het slot per video, de video-neuronen per dag en de Whisper-rem (`MAX_WHISPER_UUR` = 30). Zet die niet terug in KV. De DO spiegelt het dagtotaal naar KV `vid-neurons:<datum>` (de uur-Worker leest dat); zonder binding valt `functions/samenvatting.ts` terug op KV. Deploy: Worker vóór Pages. Workers Issues staat aan via `[observability.issues]`.

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
