# CLAUDE.md

Werkinstructies voor Claude Code in deze repo (nieuwsinkort). Overzicht: [README.md](README.md). Architectuur: [docs/architectuur.md](docs/architectuur.md). Alle teksten en UI zijn Nederlands.

## Harde regels

- **Nooit deployen zonder uitdrukkelijke goedkeuring van Joey.** Dus niet: `./deploy.sh`, `npm run deploy`, `wrangler deploy`, `wrangler pages deploy`, `wrangler secret ...`, `wrangler triggers ...`, ook niet met `DEPLOY_WORKER=1`. Goedkeuring voor één deploy geldt niet voor de volgende.
- **Geen secrets committen**: `.env`, `.dev.vars`, tokens, API-keys, `RUN_KEY`-waarde, cookies. Variabelenamen mogen in docs, waarden niet. Controleer `git diff` op secrets voor je commit.
- **Werk op een branch en maak een PR.** Nooit pushen naar `main`. Niet mergen: dat doet Joey.
- Draai de **volledige testsuite (`npm test`) één keer aan het eind**, niet na elke stap.
- **Respecteer het Workers AI-neuronbudget** (`BUDGET`=9000, `CAP`=40, zie hieronder) bij elke wijziging aan AI-aanroepen. Gratis limiet is 10.000 neuronen per dag, gedeeld door de uur-Worker en `functions/samenvatting.ts`.
- Wijzig `DEPLOY_BRANCH`, `wrangler.toml`, `worker/wrangler.toml` (crons, bindings, vars) alleen als de taak dat vraagt.

## Commando's

```bash
npm ci
npm run dev        # Vite
npm run build      # build-bronnen.mjs + tsc --noEmit + vite build
npm test           # esbuild-bundel van tests/dedup.test.ts, draait met node
npm run bronnen    # alleen public/bronnen.json opnieuw bouwen
```

Worker: `cd worker && npm ci`; typecheck zie `worker/tsconfig.json`. Lokaal draaien: `npx wrangler dev --test-scheduled --var RUN_KEY:test` (alleen lokaal, AI blijft remote en kost neuronen).

## Waar staat wat

- `src/`: frontend. `App.tsx` (hoofdscherm), `feed.tsx` (nieuwsfeed), `video.tsx` (spelers), `filters.tsx`, `beelden.tsx`/`beeld.ts` (foto's, ontdubbelen), `dedup.ts` (video's ontdubbelen), `sources.ts`, `types.ts`.
- `functions/`: Pages Functions. `data.json.ts` (merge KV `uur` + statische data; exporteert `merge`, getest), `samenvatting.ts` (video-samenvatting, POST), `meer.ts` ("Lees verder"), `media/dumpert/[[path]].ts` (HLS-proxy).
- `worker/src/`: `index.ts` (cron, Durable Objects `Runner`/`Fetcher`, endpoints), `ai.ts` (modellen en tarieven), `parse.ts` (feedparser), `videos.ts`, `x.ts`, `redlib.ts`, `weer.ts`, `artikel.ts`, `vooraf.ts` (video-samenvattingen vooraf).
- `scripts/`: `build-bronnen.mjs`, `fix-dumpert.mjs`, `add-beelden.mts`, `dhash.py`. `export_from_canvas.mjs` in de root.
- `tests/`: `dedup.test.ts` (bevat ook tests voor `beeld.ts`, `schoon.ts` en `merge`).

## Conventies

- TypeScript, ES modules, 2 spaties inspringen, dubbele quotes, puntkomma's. Compacte, dichte stijl; bestaande bestanden zijn het voorbeeld.
- Commentaar in het Nederlands, kort, vooral het *waarom* (bovenaan een bestand wat het doet). Namen mogen Nederlands zijn (`beeld`, `bronnen`, `schoon`).
- Functions en Worker hebben eigen kleine interfaces (`KV`, `Env`, `Ctx`) naast `@cloudflare/workers-types` in de Worker (`worker/package.json`, `worker/tsconfig.json`); houd ze klein en volg dat.
- Code gedeeld tussen frontend, Functions en Worker staat in `src/` (bijv. `slug.ts`, `beeld.ts`, `schoon.ts`) en wordt geïmporteerd.
- Worker draait op het Free plan: max 50 subrequests per aanroep. Ophalen gaat daarom in batches via Durable Object `Fetcher`. Houd daar rekening mee.
- Alle uitgaande verzoeken van de Worker gebruiken de UA `nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)` (uitzonderingen staan in de code, bijv. Reddit en AD).
- De Nederlandse-broncheck voor de fallback zonder AI staat in `src/bronlink.ts`; houd deze defensief voor relatieve en ongeldige feedlinks.
- Nieuwe test: voeg een `t("...", () => {...})` toe in `tests/dedup.test.ts`.

## Neuronbudget (AI-wijzigingen)

`BUDGET`=9000 neuronen/dag, `CAP`=40 nieuwe samenvattingen per run. Tiers in `worker/src/index.ts`:

- < 70%: hoofdmodel (`MODEL`, gemma-4-26b), max 40 per run
- 70–90%: klein model (`SMALL_MODEL`, llama-3.2-1b), max 15 per run
- 90–100%: alleen NL en Haarlem, max 8
- ≥ 100%: geen AI, feedtekst met `ruw: true`

Video-samenvattingen vooraf stoppen vanaf 85%; AI-uitleg voor "Lees verder" alleen onder 65%. Elke nieuwe AI-aanroep moet hierin passen: tel neuronen mee (zie `worker/src/ai.ts`), cache het resultaat in KV zodat iets maar één keer gemaakt wordt, en test niet in een lus tegen echte AI.
