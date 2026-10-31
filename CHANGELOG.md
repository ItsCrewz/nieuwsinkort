# Changelog

## Onuitgebracht

- Maak de testtypecheck compleet met typen voor de browservariant van React DOM (#299).

- Verborgen feednavigatie is niet meer focusbaar; de startknop blijft bereikbaar (#275).

- Diagnose (#158): mislukte Groq- en Mistral-calls loggen zo mogelijk veilige foutcodes en -typen, zonder berichttekst of sleutels.
- Geef Groq gpt-oss bij JSON-verzoeken meer uitvoerruimte en een lage redeneerinspanning (#160).
- Documentatie bijgewerkt voor de sportrubrieken, AI-aanbieders, budgettrappen en extractieve terugval na de merges van 30 oktober.
- Showbizz (#103): RTL Boulevard-site, Telegraaf Entertainment, NU.nl Achterklap/Muziek/Film, NOS Cultuur & media en Linda.nl (max 5) als feeds; RTL Boulevard en Shownieuws in `YT_NIEUWS`. Showbizzverhalen uit algemene feeds verhuizen via `worker/src/showcat.ts` naar Showbizz; social-feeds worden per feed-URL als niet-nieuws overgeslagen, zodat de RTL Boulevard-site wel telt.
- F1-berichten uit autobronnen komen niet meer onder Auto (#93): `sportCat` kijkt nu ook naar items met cat `auto` en herkent meer F1-termen (coureurs, GP, pole position).
- Feedtitels voor lokaal naspelen bevatten ook Voetbal, Formule 1, Auto en herkende Buitenland-berichten (#92).
- Geluidskeuze voor filmpjes, shorts en Dumpert onthouden; de videopool wordt bij een gebruikersgebaar vrijgegeven (#66). Nog niet op een echte iPhone geverifieerd.
- Direct starten (#51): volgende video vooraf in de slide en klein bufferen; native voorladen en hele HLS-segmenten kunnen de richtgrenzen van 1,55 MB wifi en 0,36 MB mobiel overschrijden. Save-Data/2G laden geen volgende video. Nog niet op iPhone geverifieerd.
- Tests toegevoegd voor feedparsing, externe URL-controle, videoslugs, Amsterdamse tijd en dataopschoning (#97).
- Nieuws-AI (#83): kortere samenvattingen en hooguit twee aanvullende punten, lagere uitvoerlimieten en hergebruik via een rubriekgebonden titelwoordencache van 24 uur.
- Buitenland (#33): oorspronkelijke koppen en alle bronnen van een cluster bepalen samen de regio; enkele buitenlandse economische namen worden in economische context herkend.

- Mistral is na Groq een optionele reserve voor tekst-AI, met een eigen dag- en maandlimiet.
- Video-samenvattingen gebruiken Groq voor transcriptie en punten met Cloudflare als terugval binnen het bestaande budget.
- AI-keten bewaart Cloudflare-fouten, slaat Cloudflare na een echte dagquota-fout over en wacht begrensd op vrije Groq-minuutvensters.
- Tekst-AI valt bij fouten terug op Groq, met limieten per model en tokens per aanbieder in de metadata (`meta.aiTokens`); Groq telt tokens mee maar geen neuronen.
- Extractieve fallback (#80): zonder AI krijgen alle rubrieken (ook tech, Haarlem en Engelstalige bronnen) een deterministische samenvatting uit de feed (`worker/src/extractief.ts`): opgeschoonde kop, eerste 2–3 zinnen (±50 woorden), Engels met "(Engels)". Items houden `ruw: true`; de kaarten tonen "nog niet samengevat" en een run met AI vervangt ze.

- AI-meting (#79): de neuronenteller loopt op de UTC-dag (Cloudflare-reset 00:00 UTC) en legt per aanroep `r.usage` vast (anders een schatting met vlag `geschat`), ook bij mislukte aanroepen; tokens en neuronen per run en per dag in `uur.meta` en `state`. `quotaOut` alleen bij een echte dagquota-fout (4006, KV-vlag `ai-quota:<UTC-dag>`), een tijdelijke 429 stopt alleen de rest van de run. Optionele env `NEURON_FACTOR` (standaard 1) als veiligheidsmarge. Nieuw: `docs/ai-budget.md` met alle AI-aanroepen en wat niet wordt meegeteld.

- Voeg bronnen en indeling voor Voetbal, Formule 1 en Auto toe, met een vaste plek in de AI-ronde: maximaal één per sportrubriek, hooguit drie per run, binnen CAP (#58); de frontend toont deze rubrieken ook (#59).
- Video's met dezelfde lange caption worden binnen drie uur ook over verschillende platforms ontdubbeld (#46); de beste kopie behoudt de andere bron in `ook`.

## 2026-10-30

- Desktop zonder swipe-feed (#67): Filmpjes en Dumpert tonen op muis/trackpad de gewone weergave met kopjes, tabbladen en kaarten; de TikTok-achtige swipe-feed blijft op touch (`(pointer: coarse)` of `(hover: none)`, niet op schermbreedte, met reactie op wijzigingen). Op desktop opent een kaart het filmpje bij de bron. Nieuw: `src/invoer.ts`, `tests/invoer.test.ts`.
- Vaste videopool (#50): 3 hergebruikte `<video>`-elementen in de feed i.p.v. een nieuw element per slide (Apple/native HLS: max 2 met bron, Save-Data/2G: alleen actief), tegen vastlopen op iOS. Op een echte iPhone nog niet geverifieerd.
- Verborgen video-debug-overlay voor diagnose op de iPhone (#50).

- Filmpjes (#60): sport-, voetbal-, Formule 1- en autokanalen toegevoegd aan de YouTube-kanaalfeeds, inclusief Shorts; bouwt voort op PR #55.

- Alleen nieuws en video's van de huidige Amsterdamse dag; oude data verdwijnt na middernacht (#56).

- Artikelprompts (#49) vragen eenvoudig Nederlands voor volwassenen (B1), korte zinnen (liefst hooguit 15 woorden, nooit meer dan 20), uitleg van moeilijke woorden en afkortingen voluit; feiten blijven uit de invoer komen. Bestaande samenvattingen blijven gecachet.

- Reddit-filmpjes (#47): directe HLS-weergave en ondersteuning voor YouTube-links, met thumbnails en ontdubbeling via de Reddit-permalink.

- Filmpjes (#48): de YouTube-kanaalfeeds van NOS Stories, Nieuwsuur, Omroep PowNed en Radar toegevoegd, inclusief Shorts. TikTok en Facebook hebben geen gratis accountfeed die aan de voorwaarden voldoet.

- Videoherstel (#44): de voortgangsbalk volgt de werkelijke afspeeltijd; bij stilstand volgt een herstelpoging en zo nodig herladen.

- Performance artikelen (#35), vervolg: `/data.json` start vanuit `index.html` tijdens het parsen (hergebruikt door `useData`, `src/vroeg.ts`; nieuwe CSP-hash); Inter self-hosted i.p.v. Google Fonts (CSP `font-src 'self'`, `/fonts/*` immutable); `NewsFeed` mount kaartinhoud alleen rond de huidige kaart (DOM kleiner, lagere TBT).
- Performance artikelen (#35): `/data.json` krijgt een ETag en antwoordt met 304 zonder body als er niets nieuws is (de `?t=`-cachebuster in `useData` is weg, zodat de 15-minutenverversing voorwaardelijk kan); `Cache-Control: max-age=0, must-revalidate, stale-while-revalidate=300`; diagnosevelden `ontdubbeld` en `routine_gegenereerd` gaan niet meer mee (`slim`). `public/_headers`: cache voor `/bronnen.json` en de iconen. Eerste foto van een bovenste kaart krijgt `fetchpriority=high`.
- Weerblok is landelijk (issue #37): plaats "Nederland", Buienradar over alle landstations (mediaan en bereik), Open-Meteo met drie punten (noord/midden/zuid) in één verzoek, KNMI-weerbericht met de landelijke waarschuwingsregel (geen Noord-Holland-pagina meer, één verzoek minder per run). `simpelWeer`-prompt "heel Nederland"; zelfde aantal AI-calls en invoerlengte, de weertekst wordt na de deploy eenmalig opnieuw herschreven. Rubriek Haarlem ongewijzigd. `scripts/pipeline/weer.py` (oude pipeline) niet aangepast.

- Filmpjes en Dumpert worden na het laden vooraf warm gemaakt (thumbnails, hls.js-chunk, begin van de eerste streams/mp4, preconnect), alleen in idle-tijd en afhankelijk van de verbinding (Save-Data/2g: niets; cellular/3g: alleen thumbnails en hls.js) (#34).
- Videofeed (#36): pure module `src/buffer.ts` met begrensde bufferregels per netwerkniveau (volgende 12 s / 4 MB, 3g de helft, Save-Data/2g alleen playlist) en `tests/buffer.test.ts`. De pool (#50) en direct starten (#51) uit main blijven leidend; `feed.tsx` gebruikt `buffer.ts` nog niet.
- Durable Object `Budget` (SQLite, migratie `v2`, binding `BUDGET_DO`) is de enige eigenaar van het slot per video, de reservering van video-neuronen per dag en de Whisper-uurrem (30/uur) voor `/samenvatting` (audit K1, issue #8, vervolg op PR #21). KV `vid-neurons:<datum>` blijft als spiegel voor de uur-Worker; zonder binding valt de Function terug op KV.
- Workers Issues (gratis open beta) aangezet via `[observability.issues]` in `worker/wrangler.toml`.
- Audit-ronde van vandaag: K10 deploy-integriteit (#17), K11 signalering bij mislukte runs (#18) en deze budget-wijziging.
- Deploy-volgorde: Worker vóór Pages.
- Clusteren verbeterd (issue #38): `worker/src/cluster.ts` is een aparte, geteste module. Dubbele berichten over hetzelfde verhaal (bijv. "AI-verbod op basisscholen" bij Tweakers en Security.nl) gaan nu samen dankzij 2-letter-acroniemen (AI, EU), lichte NL-stam/synoniemen, hulpwerkwoorden als stopwoord, een lijst algemene woorden en de beschrijving als extra bewijs. Kandidaten worden met elk clusterlid afzonderlijk vergeleken (max over leden) in plaats van met de unie, zodat een verhaal met veel bronnen ook de volgende bron aantrekt (alle 6 bronnen van het AI-verbod in één cluster). Nieuw: `tests/cluster.test.ts`, `tests/live-cluster.ts`, `scripts/feedtitels.mts`.

- De swipe-feed blijft bij appwisselen en herladen open en bewaart de videopositie, ook als de videolijst tussentijds ververst.
