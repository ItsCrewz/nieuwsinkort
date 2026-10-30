# Changelog

- Extractieve fallback (#80): zonder AI krijgen alle rubrieken (ook tech, Haarlem en Engelstalige bronnen) een deterministische samenvatting uit de feed (`worker/src/extractief.ts`): opgeschoonde kop, eerste 2–3 zinnen (±50 woorden), Engels met "(Engels)". Items houden `ruw: true`; de kaarten tonen "nog niet samengevat" en een run met AI vervangt ze.

- AI-meting (#79): de neuronenteller loopt op de UTC-dag (Cloudflare-reset 00:00 UTC) en legt per aanroep `r.usage` vast (anders een schatting met vlag `geschat`), ook bij mislukte aanroepen; tokens en neuronen per run en per dag in `uur.meta` en `state`. `quotaOut` alleen bij een echte dagquota-fout (4006, KV-vlag `ai-quota:<UTC-dag>`), een tijdelijke 429 stopt alleen de rest van de run. Optionele env `NEURON_FACTOR` (standaard 1) als veiligheidsmarge. Nieuw: `docs/ai-budget.md` met alle AI-aanroepen en wat niet wordt meegeteld.

- Voeg bronnen en indeling voor Voetbal, Formule 1 en Auto toe, met een vaste plek in de AI-ronde: maximaal één per sportrubriek, hooguit drie per run, binnen CAP (#58); de frontend volgt in #59.
- Video's met dezelfde lange caption worden binnen drie uur ook over verschillende platforms ontdubbeld (#46); de beste kopie behoudt de andere bron in `ook`.

## 2026-10-30

- Filmpjes (#60): sport-, voetbal-, Formule 1- en autokanalen toegevoegd aan de YouTube-kanaalfeeds, inclusief Shorts; bouwt voort op PR #55.

- Alleen nieuws en video's van de huidige Amsterdamse dag; oude data verdwijnt na middernacht (#56).

- Artikelprompts (#49) vragen eenvoudig Nederlands voor volwassenen (B1), korte zinnen (liefst hooguit 15 woorden, nooit meer dan 20), uitleg van moeilijke woorden en afkortingen voluit; feiten blijven uit de invoer komen. Bestaande samenvattingen blijven gecachet.

- Reddit-filmpjes (#47): directe HLS-weergave en ondersteuning voor YouTube-links, met thumbnails en ontdubbeling via de Reddit-permalink.

- Filmpjes (#48): de YouTube-kanaalfeeds van NOS Stories, Nieuwsuur, Omroep PowNed en Radar toegevoegd, inclusief Shorts. TikTok en Facebook hebben geen gratis accountfeed die aan de voorwaarden voldoet.

- Videoherstel (#44): de voortgangsbalk volgt de werkelijke afspeeltijd; bij stilstand volgt een herstelpoging en zo nodig herladen.

- Performance artikelen (#35), vervolg: `/data.json` start vanuit `index.html` tijdens het parsen (hergebruikt door `useData`, `src/vroeg.ts`; nieuwe CSP-hash); Inter self-hosted i.p.v. Google Fonts (CSP `font-src 'self'`, `/fonts/*` immutable); `NewsFeed` mount kaartinhoud alleen rond de huidige kaart (DOM kleiner, lagere TBT).
- Performance artikelen (#35): `/data.json` krijgt een ETag en antwoordt met 304 zonder body als er niets nieuws is (de `?t=`-cachebuster in `useData` is weg, zodat de 15-minutenverversing voorwaardelijk kan); `Cache-Control: max-age=0, must-revalidate, stale-while-revalidate=300`; diagnosevelden `ontdubbeld` en `routine_gegenereerd` gaan niet meer mee (`slim`). `public/_headers`: cache voor `/bronnen.json` en de iconen. Eerste foto van een bovenste kaart krijgt `fetchpriority=high`.
- Weerblok is landelijk (issue #37): plaats "Nederland", Buienradar over alle landstations (mediaan en bereik), Open-Meteo met drie punten (noord/midden/zuid) in één verzoek, KNMI-weerbericht met de landelijke waarschuwingsregel (geen Noord-Holland-pagina meer, één verzoek minder per run). `simpelWeer`-prompt "heel Nederland"; zelfde aantal AI-calls en invoerlengte, de weertekst wordt na de deploy eenmalig opnieuw herschreven. Rubriek Haarlem ongewijzigd. `scripts/pipeline/weer.py` (oude pipeline) niet aangepast.
- Durable Object `Budget` (SQLite, migratie `v2`, binding `BUDGET_DO`) is de enige eigenaar van het slot per video, de reservering van video-neuronen per dag en de Whisper-uurrem (30/uur) voor `/samenvatting` (audit K1, issue #8, vervolg op PR #21). KV `vid-neurons:<datum>` blijft als spiegel voor de uur-Worker; zonder binding valt de Function terug op KV.
- Workers Issues (gratis open beta) aangezet via `[observability.issues]` in `worker/wrangler.toml`.
- Audit-ronde van vandaag: K10 deploy-integriteit (#17), K11 signalering bij mislukte runs (#18) en deze budget-wijziging.
- Deploy-volgorde: Worker vóór Pages.
- Clusteren verbeterd (issue #38): `worker/src/cluster.ts` is een aparte, geteste module. Dubbele berichten over hetzelfde verhaal (bijv. "AI-verbod op basisscholen" bij Tweakers en Security.nl) gaan nu samen dankzij 2-letter-acroniemen (AI, EU), lichte NL-stam/synoniemen, hulpwerkwoorden als stopwoord, een lijst algemene woorden en de beschrijving als extra bewijs. Kandidaten worden met elk clusterlid afzonderlijk vergeleken (max over leden) in plaats van met de unie, zodat een verhaal met veel bronnen ook de volgende bron aantrekt (alle 6 bronnen van het AI-verbod in één cluster). Nieuw: `tests/cluster.test.ts`, `tests/live-cluster.ts`, `scripts/feedtitels.mts`.
