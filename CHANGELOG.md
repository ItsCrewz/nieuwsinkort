# Changelog

## 2026-10-30

- Durable Object `Budget` (SQLite, migratie `v2`, binding `BUDGET_DO`) is de enige eigenaar van het slot per video, de reservering van video-neuronen per dag en de Whisper-uurrem (30/uur) voor `/samenvatting` (audit K1, issue #8, vervolg op PR #21). KV `vid-neurons:<datum>` blijft als spiegel voor de uur-Worker; zonder binding valt de Function terug op KV.
- Workers Issues (gratis open beta) aangezet via `[observability.issues]` in `worker/wrangler.toml`.
- Audit-ronde van vandaag: K10 deploy-integriteit (#17), K11 signalering bij mislukte runs (#18) en deze budget-wijziging.
- Deploy-volgorde: Worker vóór Pages.
