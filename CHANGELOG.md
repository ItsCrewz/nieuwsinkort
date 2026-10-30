# Changelog

## 2026-10-30

- Performance artikelen (#35), vervolg: `/data.json` start vanuit `index.html` tijdens het parsen (hergebruikt door `useData`, `src/vroeg.ts`; nieuwe CSP-hash); Inter self-hosted i.p.v. Google Fonts (CSP `font-src 'self'`, `/fonts/*` immutable); `NewsFeed` mount kaartinhoud alleen rond de huidige kaart (DOM kleiner, lagere TBT).
- Performance artikelen (#35): `/data.json` krijgt een ETag en antwoordt met 304 zonder body als er niets nieuws is (de `?t=`-cachebuster in `useData` is weg, zodat de 15-minutenverversing voorwaardelijk kan); `Cache-Control: max-age=0, must-revalidate, stale-while-revalidate=300`; diagnosevelden `ontdubbeld` en `routine_gegenereerd` gaan niet meer mee (`slim`). `public/_headers`: cache voor `/bronnen.json` en de iconen. Eerste foto van een bovenste kaart krijgt `fetchpriority=high`.
- Durable Object `Budget` (SQLite, migratie `v2`, binding `BUDGET_DO`) is de enige eigenaar van het slot per video, de reservering van video-neuronen per dag en de Whisper-uurrem (30/uur) voor `/samenvatting` (audit K1, issue #8, vervolg op PR #21). KV `vid-neurons:<datum>` blijft als spiegel voor de uur-Worker; zonder binding valt de Function terug op KV.
- Workers Issues (gratis open beta) aangezet via `[observability.issues]` in `worker/wrangler.toml`.
- Audit-ronde van vandaag: K10 deploy-integriteit (#17), K11 signalering bij mislukte runs (#18) en deze budget-wijziging.
- Deploy-volgorde: Worker vóór Pages.
