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

- Stack: Vite 8, React 18, TypeScript 5, Tailwind 3, hls.js; Cloudflare Pages Functions (`functions/`); Worker `nieuwsinkort-uur` (`worker/`, Durable Objects `Runner`/`Fetcher`, KV `NIEUWS`, Workers AI).
- Commando's: `npm ci`, `npm run dev`, `npm run build` (bronnen + tsc + vite), `npm test`.
- Indeling: `src/` frontend, `functions/` Pages Functions (`data.json.ts`, `samenvatting.ts`, `meer.ts`, `media/dumpert/`), `worker/src/` uur-Worker, `scripts/` hulpscripts, `tests/` tests, `public/` statisch (`data.json`, `bronnen.json`), `prod-frozen/` bevroren oude build.
- Stijl: TypeScript, ES modules, 2 spaties, dubbele quotes, puntkomma's; compacte code; commentaar in het Nederlands en kort (het waarom). Gedeelde code staat in `src/`. Functions en Worker gebruiken eigen kleine interfaces (`KV`, `Env`, `Ctx`); de Worker heeft daarnaast wel `@cloudflare/workers-types` (`worker/package.json`, `worker/tsconfig.json`).
- Worker draait op het Free plan: max 50 subrequests per aanroep, daarom batches via `Fetcher`.
- De fallback zonder AI gebruikt `src/bronlink.ts` voor een defensieve Nederlandse-broncheck; relatieve en ongeldige feedlinks mogen de uurrun niet laten crashen.
- Alle teksten (UI, docs, commits, commentaar) zijn Nederlands.
- Externe `href`'s in de UI altijd via `veiligeUrl()` (`src/url.ts`); feed-links in de Worker via `absUrl()` (`worker/src/parse.ts`).
- Worker-endpoints `/run` en `/uur`: gebruik `Authorization: Bearer <RUN_KEY>`, nooit een URL-sleutel. `force=1` wordt binnen tien minuten na de laatste runstart geweigerd. Test dit zonder echte AI-aanroepen.
- Tijdlogica: gedeelde Amsterdamse middernacht in `src/tijd.ts`; test DST en de referentiedag `gegenereerd` in `tests/filters.test.ts`. Relatieve filters blijven tegen nu rekenen, berichttijden hebben 20 minuten toekomstmarge.

## Beveiligingsheaders

Houd de CSP-hash in `public/_headers` gelijk aan de exacte inhoud van het inline thema-script in `index.html`. Pages Functions zetten zelf `X-Content-Type-Options: nosniff` (ook bij foutantwoorden); `_headers` geldt alleen voor statische bestanden. Laat `prod-frozen/_headers` ongemoeid zolang die build niet gebruikt wordt.
