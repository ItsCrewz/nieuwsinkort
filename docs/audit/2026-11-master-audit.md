# Master-audit nieuwsinkort.nl (#1236, fase 1 en 10)

Datum: 18-11-2026. Alleen audit en plan; er zijn geen codewijzigingen gedaan. Alle bevindingen komen uit het lezen van de repo (basis `origin/main`). Er was geen netwerk, dus de live site is **niet** onderzocht.

Leeswijzer: **Bevestigd** = in de code of docs aangetoond (met bestandsverwijzing). **Risico** = waarschijnlijk, maar afhankelijk van iets dat ik niet kon zien. **Kans** = verbetermogelijkheid. **Niet verifieerbaar** = vereist live toegang of externe accounts. Er zijn geen meetwaarden verzonnen.

## 1. Executive summary

Nieuwsinkort is een Vite/React-SPA op Cloudflare Pages met Pages Functions, plus een aparte cron-Worker (`nieuwsinkort-uur`, elke 15 min tussen 04 en 22 uur) die feeds ophaalt, clustert en met AI samenvat. Techniek en testdekking zijn sterk: 206 testbestanden in `tests/` en 148 in `tests/regressie` (354 in totaal; telling: `ls tests/*.test.ts | wc -l` en `find tests/regressie -name '*.test.ts' | wc -l`), Playwright e2e, een prestatiebudget, strakke CSP en netwerkbeveiliging (SSRF-allowlists). De server levert aan crawlers `/vandaag`, per-bericht HTML met NewsArticle-JSON-LD, `sitemap.xml` en `sitemap-nieuws.xml`.

De belangrijkste zwaktes zijn niet technisch maar juridisch, redactioneel en structureel:

1. **Auteursrecht en bronbeheer (P0).** Er is geen bronrechtenregister. De uitspraak ECLI:NL:GHAMS:2026:2977 komt nergens in repo of docs voor. De Worker leest volledige artikeltekst, onder meer via de externe dienst r.jina.ai, gebruikt bronbeelden via een eigen proxy en neemt Instagram-content over via een derde-partij-scraper (`kg.meowing.de`, zie B16). De juridische toets ontbreekt.
2. **Uitgeversinformatie (P0/P1).** `/over` bestaat met uitleg, fouten/correcties en privacy, maar bevat geen contactgegevens, uitgever/verantwoordelijke, redactioneel beleid of correctielog. Dat is vereist voor Google News en AdSense.
3. **Geen archief.** Berichtpagina's bestaan alleen voor vandaag (en gisteren tot 06:00) en geven daarna een 301 naar `/`. De site bouwt dus geen indexeerbare inhoud op.
4. **Geen CI.** `.github/` bevat alleen een issue-template. Tests en build draaien alleen lokaal via `npm run check`.
5. **Publicatiecontrole.** Er is een structurele samenvattingscheck (`somcheck.ts`), maar geen feitencheck tegen de bron, geen gevoelig-onderwerpenstap en geen correctielog.
6. **Bereikbaarheid.** Het signaal van 18-11 is hier niet te beoordelen (zie sectie 6). Vanuit de code is geen oorzaak aan te wijzen.

## 2. Auditbevindingen

### 2.1 Bevestigd

| # | Onderdeel | Probleem | Bewijs | Impact | Prio | Oplossing |
|---|---|---|---|---|---|---|
| B1 | Auteursrecht | Geen bronrechtenregister; ECLI:NL:GHAMS:2026:2977 niet in repo | grep in `docs/`, `src/`, `worker/src/`: geen treffer op de ECLI; `public/bronnen.json` bevat alleen feeds/hosts | Juridisch risico onbekend en niet vastgelegd | P0 | Register per bron (rechtenstatus, voorwaarden, uitsluiting); menselijke juridische beoordeling |
| B2 | Auteursrecht | Volledige artikeltekst wordt gelezen, deels via derde partij r.jina.ai | `worker/src/index.ts:180-186`, `worker/src/artikel.ts:71` | Mogelijk gebruik van beschermde tekst buiten feedvoorwaarden; privacy/voorwaarden van Jina | P0 | Per bron vastleggen of volledige tekst gebruikt mag worden; anders alleen feedtekst |
| B3 | Auteursrecht | Bronbeelden worden via eigen proxy en als og:image gebruikt | `src/beeldhost.ts` (allowlist uitgeversbeeldhosts), `src/berichthtml.ts` `deelbeeld()` | Beeldrechten zijn nergens vastgelegd | P0 | Beeldrechten per host beoordelen; per bron uitzetbaar maken (Instagram-beelden via de scraper: zie B16) |
| B4 | Uitgeversinfo | `/over` zonder contact, uitgever, redactioneel beleid, correctielog | `public/over.html` (secties: Wat, Hoe, Bronnen, Fouten en correcties, Privacy); docs: "zonder persoonsnaam of verzonnen contactadres" | Blokkeert Google News en AdSense; geen meldroute voor rechthebbenden | P0 | Contactadres, uitgeversgegevens en beleid door Joey laten aanleveren; tekst toevoegen |
| B5 | Privacy | Cloudflare Web Analytics laadt zonder toestemmingsstap (alleen opt-out via `?nietmeten=1`) | `src/analytics.ts`; `docs/architectuur.md` "Bezoekersstatistieken" | Cookieloze meting is vermoedelijk toegestaan, maar niet juridisch getoetst (docs zeggen dat zelf); privacytekst vermeldt de meting niet | P1 | Privacyverklaring uitbreiden met meting, AI-aanbieders en bewaartermijnen; juridische toets |
| B6 | Privacy | Privacytekst is één zin ("geen trackingcookies") | `public/over.html` | Onvoldoende voor AVG-informatieplicht (AI-aanbieders Groq/Mistral, Cloudflare, YouTube-embeds) | P1 | Volledige privacyverklaring |
| B7 | Indexering | Geen archief: berichtpagina's 301 naar `/` na gisteren 06:00 | `functions/bericht/[[pad]].ts` | Geen opbouw van indexeerbare inhoud, geen long-tail verkeer | P1 (productkeuze) | Beslissing van Joey; optie: dagarchief of onderwerpdossiers (zie F-lijst) |
| B8 | CI | Geen CI-workflow | `.github/` bevat alleen `ISSUE_TEMPLATE/taak.md`; `scripts/check.sh` bestaat | Regressies blijven onopgemerkt zonder lokaal draaien | P1 | GitHub Actions: lint, test, build, typechecks |
| B9 | Beveiliging | HSTS `max-age=604800` (1 week), zonder `includeSubDomains`/`preload` | `public/_headers`; sitemaps zetten `86400` of `604800` | Zwakke HSTS-bescherming | P2 | Verhogen naar een jaar na bevestiging dat alle subdomeinen HTTPS hebben (apart akkoord) |
| B10 | Publicatiekwaliteit | Geen feitencheck tegen bron; geen gevoelig-onderwerpenstap; geen correctielog | `worker/src/somcheck.ts` toetst alleen de som zelf (lege kern, gelijk aan kop, te kort); `docs/weigerzinnen.md` | Onjuiste AI-feiten kunnen gepubliceerd worden; sommen worden niet herzien als de bron wijzigt (`over.html` zegt dat zelf) | P1 | Zie vervolg-Issues V7 en V8 |
| B11 | Nieuwsselectie | Hoofdartikel = cluster met meeste bronnen, geen instelbare nieuwswaardescore | `docs/ontwerp-desktop-nieuwsoverzicht.md` | Populariteit/aantal bronnen = nieuwswaarde; botst met de eis "populariteit ≠ nieuwswaarde" | P1 | Transparante, instelbare weging (zie V9) |
| B12 | Structured data | JSON-LD heeft WebSite, NewsMediaOrganization en per bericht NewsArticle; geen BreadcrumbList | `index.html`, `src/berichthtml.ts` | Kleine SEO-kans; `author` is een Organization (geen persoon) | P2 | BreadcrumbList toevoegen; uitleg over auteurschap bij AI-samenvattingen |
| B13 | SEO | Homepage `/` heeft in de HTML alleen `<noscript>`-inhoud; de feed zelf is client-side | `functions/index.ts`, `src/homehtml.ts`, `index.html` | Crawlers zonder JS zien alleen de noscript-lijst; berichtpagina's en `/vandaag` compenseren dat | P2 | Meten of dit volstaat (Search Console), pas daarna eventueel uitbreiden |
| B14 | Beveiliging | CSP heeft `style-src 'unsafe-inline'` en brede `img-src https:`, `connect-src https:` | `public/_headers` | Bewuste keuze (voorladen, beelden); beperkt de bescherming | P3 | Alleen aanpassen met aantoonbare winst; niet nu |
| B15 | Bronnen | `bronnen.json` is gegenereerd op 2026-11-01; actuele bronstatus is niet te toetsen zonder live data | `public/bronnen.json` (`gegenereerd`) | Mogelijk verouderd of kapotte bronnen | P2 | `npm run check:bronlinks` live draaien (Joey/orchestrator) |
| B16 | Auteursrecht / voorwaarden | Instagram-content komt binnen via de derde-partij-scraper `kg.meowing.de` (Kittygram-atomfeeds, `https://kg.meowing.de/<account>/atom.xml`, `ua: "bot"`), naast de profiel-embed in de Worker (R1). Het gaat om 27 unieke accounts, onder meer nieuwsorganisaties, politieke partijen en politici, en lokale media | `public/bronnen.json` (zoek op `kg.meowing.de`); `worker/src/index.ts:113-121` (embed) | Keten Instagram → onbekende derde partij → Nieuwsinkort: auteursrecht, Instagram-voorwaarden, privacy (persoonsgegevens van politici/burgers) en afhankelijkheid van een dienst zonder afspraken of continuïteitsgarantie | P0 | Opnemen in het register (V1); per account uitzetbaar (V2); juridische beoordeling door Joey/jurist; fallback of verwijderen als de dienst wegvalt |

### 2.2 Waarschijnlijke risico's

- **R1.** Instagram wordt uitgelezen via profiel-embed en MP4's van derden (`worker/src/index.ts:113-121`) en daarnaast via de scraper `kg.meowing.de` (bevestigd, zie B16). Dat valt vermoedelijk buiten de voorwaarden van Instagram en kan zonder waarschuwing breken. De beoordeling is juridisch, niet technisch.
- **R2.** Het gebruik van meerdere externe AI-aanbieders (Cloudflare, Groq, Mistral; `docs/ai-aanbieders.md`) betekent dat bron- en artikeltekst naar derden gaat. Verwerkersafspraken zijn niet in de repo terug te vinden.
- **R3.** `dateModified` ontbreekt tenzij `gewijzigd` gevuld is; een inhoudelijke herziening wordt dus mogelijk niet doorgegeven. Hoe vaak `gewijzigd` gevuld wordt, is hier niet gemeten.
- **R4.** Het Free-plan (50 subrequests, 1.000 KV-writes/dag, 10.000 neuronen/dag) is krap bij groei. De bestaande maatregelen (#452, `BUDGET`) zijn goed, maar er is weinig marge voor promotieverkeer en nieuwsbrief.
- **R5.** De videopool en HLS-buffering zijn "niet op een echte iPhone geverifieerd" (CLAUDE.md). Dit is een bekend, open risico.

### 2.3 Kansen

- **K1.** Nieuwswaardescore met zichtbare weging (actualiteit, NL-relevantie, bronbetrouwbaarheid, rubrieksdiversiteit), vastgelegd in één configbestand en getest.
- **K2.** "Vandaag in 2 minuten": hergebruikt de bestaande taboverzichten (#134) en de bestaande briefing (`src/tabbriefing.tsx`), zonder extra AI-aanroepen.
- **K3.** Bewaarde artikelen via `localStorage`, zonder account.
- **K4.** Reservering van advertentieruimte als pure, uitgeschakelde component zonder script.
- **K5.** Een `/redactie`-pagina (beleid, correcties, bronnenlijst met rechtenstatus) die B1, B4 en B10 samen oplost.

### 2.4 Niet verifieerbaar (geen netwerk of toegang)

DNS en domeinconfiguratie; certificaat en HTTPS-redirects in productie; live HTTP-statuscodes; publieke bereikbaarheid (het signaal van 18-11); of `robots.txt` en de sitemaps live kloppen; Google Search Console (indexatie, handmatige acties); Lighthouse, Core Web Vitals en CrUX (p75); de Cloudflare Web Analytics-data; echte iPhone-gedrag; visuele controle op meerdere schermformaten; de werkelijke inhoud van de huidige `data.json`; de voorwaarden en robots-regels van elke bron. **Checklist voor Joey** staat in sectie 6.

## 3. Wat er al goed is (niet aanraken)

- Hostredirects en `noindex` op previews (`functions/_middleware.ts`).
- `robots.txt` met beide sitemaps; berichtpagina met canonical, `max-image-preview:large`, `noindex` voor `ruw` en politiek, zonder `lastmod` in de news-sitemap (#712) en zonder toekomstige datums (#1175).
- 503 met `Retry-After` bij onleesbare data in plaats van lege sitemaps (#599).
- Neuronbudget, KV-write-limiet, SSRF-allowlist en tests per onderwerp.

## 4. Implementatieplan

Volgorde: eerst juridisch en vertrouwen (P0), dan indexeer- en kwaliteitsbasis (P1), dan groei (P2) en innovatie (P3). Elk item is klein genoeg voor één PR en vraagt geen nieuwe betaalde service of nieuwe bron. Designwijzigingen (fase 2) wachten op akkoord van Joey.

**Botsing met #1067.** De master prompt zegt "niet generiek zoals NU.nl/NOS". Het voorstel in `docs/ontwerp-desktop-nieuwsoverzicht.md` (hoofdartikel, drie kaarten, rubriekkolommen, sidebar) volgt juist het klassieke nieuwsportaal-patroon. Dat is geen fout, maar het botst met de uitgesproken richting. Voorstel: Joey beslist eerst of #1067 doorgaat of herzien wordt; V12 en V13 staan los van die keuze.

## 5. Vervolg-Issues (geprioriteerd, klein en zelfstandig mergebaar)

Geen Issues aangemaakt; dat doet de orchestrator.

### P0 — Kritieke basis

- **V1. Bronrechtenregister (alleen data en doc).** Nieuw `docs/bronrechten.md` of `public`-onafhankelijk bestand met per bron: voorwaarden-URL, rechtenstatus (onbekend/toegestaan/beperkt/uitgesloten), beeldrechten, gebruik volledige tekst ja/nee, datum laatste beoordeling. Vermeldt ECLI:NL:GHAMS:2026:2977 als open juridische vraag, zonder uitspraken over de inhoud. Het register bevat ook de 27 `kg.meowing.de`-accounts (B16) en de Instagram-profielembed, elk per account met eigen status.
  *Acceptatie:* elke bron uit `bronnen.json` komt voor (ook elk meowing-account en elk Instagram-embedaccount apart); status "onbekend" tot Joey/jurist beoordeelt; test dat bron-id's in register en `bronnen.json` overeenkomen.
- **V2. Uitsluitoptie per bron.** Vlag `uitgesloten` in de bronconfiguratie die ophalen, samenvatten en tonen stopt (geen nieuwe bronnen, alleen uitzetten). Eis: zowel de `kg.meowing.de`-feeds als de Instagram-embed zijn per account uitzetbaar.
  *Acceptatie:* test dat een uitgesloten bron niet in `data.json` komt en niet in sitemaps, met een aparte test voor een meowing-account en voor een embed-account; bestaande tests groen.
- **V3. Volledige tekst en Jina per bron regelbaar.** Vlag per bron "alleen feedtekst" die `r.jina.ai` en artikelfetch overslaat. Eis: ook voor de meowing-feeds en de Instagram-embed per account instelbaar (alleen feedtekst, geen scraper-MP4's of -beelden).
  *Acceptatie:* mock-test zonder netwerk, ook voor de meowing- en embed-route; neuronen- en subrequestbudget onveranderd of lager.
- **V4. Uitgeversinformatie op `/over` (of `/redactie`).** Contactadres, verantwoordelijke, redactioneel beleid en correctiebeleid, met meldroute voor rechthebbenden. Gegevens levert Joey aan; geen verzonnen adres.
  *Acceptatie:* pagina in sitemap, `OVER_LASTMOD` bijgewerkt, link in footer, bestaande `seo-meta`-test groen; zonder script.
- **V5. Bereikbaarheidscontrole (live, door Joey of orchestrator).** Draai de checklist uit sectie 6 en leg de uitkomst vast in een Issue-comment.
  *Acceptatie:* per punt een resultaat of "niet uitvoerbaar"; bij een afwijking een los bugissue.

### P1 — Belangrijk vóór promotie

- **V6. CI-workflow.** `.github/workflows/ci.yml` met `npm ci`, `npm run check` (lint, tests, build, typechecks) op pull requests.
  *Acceptatie:* workflow groen op een testbranch; geen secrets; geen deploystap.
- **V7. Feitencontrole-lichtgewicht (zonder extra AI).** Pure module die cijfers, jaartallen en eigennamen in de samenvatting vergelijkt met kop, feedtekst en brontekst; bij een extra getal of naam markeert hij de som als `ruw` (bestaande extractieve route). Past bij `somcheck.ts`.
  *Acceptatie:* tests in `tests/` met echte fixture (zonder secrets); geen extra Cloudflare-aanroepen; `somAfgekeurd`-meta tellen mee.
- **V8. Gevoelige onderwerpen en correctielog.** Woordenlijst voor gezondheid, veiligheid, financiën, beschuldigingen en verkiezingen: strengere regel (alleen extractief of `noindex`). Daarnaast een correctielog (`gewijzigd`, korte reden) dat zichtbaar op de berichtpagina en in `dateModified` terugkomt.
  *Acceptatie:* tests; geen KV-schrijver erbij (#452); zichtbare datum en JSON-LD komen overeen.
- **V9. Nieuwswaardescore met instelbare weging.** `src/nieuwswaarde.ts` (pure module) met gewichten in een configobject; vervangt "meeste bronnen" voor de keuze van het hoofdartikel pas na akkoord op V13.
  *Acceptatie:* tests met vaste fixtures; geen clickbaitfactor; rubrieksdiversiteit meetbaar.
- **V10. BreadcrumbList en auteurschap in JSON-LD.** Alleen eigenschappen die zichtbaar zijn.
  *Acceptatie:* uitbreiding van `tests/seo-meta.test.ts`; JSON-LD valideert tegen schema.org-eigenschappen die al gebruikt worden.
- **V11. Privacyverklaring uitbreiden.** Beschrijf Cloudflare Web Analytics, AI-aanbieders, YouTube-embeds (`youtube-nocookie`), bewaartermijnen en rechten van betrokkenen. Juridische toets door Joey.
  *Acceptatie:* tekst op `/over` of `/privacy`; geen nieuw script; link vanuit footer.
- **V12. Lighthouse-/CWV-nulmeting (handmatig of CI-artifact).** Draai mobiele Lighthouse en leg de uitkomst vast; beoordeel p75 pas na echte CrUX-/Cloudflare-data.
  *Acceptatie:* gemeten waarden met datum en conditie, of "niet gemeten".
- **V13. Besluit over archief en design (#1067).** Alleen een beslisnotitie: archief ja/nee, en hoe #1067 zich verhoudt tot "niet generiek". Geen code.
  *Acceptatie:* akkoord van Joey vastgelegd.

### P2 — Groei

- **V14. "Vandaag in 2 minuten"** op basis van bestaande briefingdata; geen nieuwe AI-aanroepen.
- **V15. Bewaarde artikelen** via `localStorage`, geen account.
- **V16. Analytics-rapportage zonder cijfers verzinnen:** `docs/` met welke Cloudflare-mutaties beschikbaar zijn en welke niet (hash-routes beperken meting per rubriek, zie architectuur); optioneel pad-gebaseerde meting via echte URL's op berichtpagina's.
- **V17. Nieuwsbrief-onderzoek (alleen document):** kosten mailprovider, toestemming (dubbele opt-in), afmelden; geen provider activeren.
- **V18. Advertentievoorbereiding (uitgeschakeld):** reserveringscomponent met vaste hoogte en label "Advertentie", zonder script; pas activeren na consent-oplossing en V4/V11.

### P3 — Innovatie

- **V19. Onderwerpdossiers** (tijdlijn) op bestaande clustering; pas na V13.
- **V20.** PWA/pushmeldingen/audiojournaal: alleen als losse onderzoeksnotitie.

## 6. Checklist voor Joey (niet verifieerbaar zonder netwerk)

1. `dig nieuwsinkort.nl` en `www.nieuwsinkort.nl`: A/AAAA/CNAME en nameservers.
2. `curl -sI https://nieuwsinkort.nl/`, `/robots.txt`, `/sitemap.xml`, `/sitemap-nieuws.xml`, `/vandaag`, `/over`: statuscode, `content-type`, `x-robots-tag`, redirects (http→https, www→apex).
3. Certificaat: geldigheid en ketting.
4. `https://nieuwsinkort.nl/` met JavaScript uit: zie je de noscript-lijst?
5. Search Console: dekking, sitemapstatus, handmatige acties, Google News-opname.
6. Let op: de externe controle van 18-11 kan ook door de `Retry-After`/503-paden of een mislukte run komen. Controleer `run-status` en `/data.json` (autorisatie niet nodig voor `/data.json`).
7. Lighthouse (mobiel) en Cloudflare Web Analytics (CWV) bekijken.
8. Controleer of `kg.meowing.de` bereikbaar is, wie de dienst beheert en wat de voorwaarden zijn (B16).
9. Echte iPhone: videofeed en geluid (nog niet geverifieerd).

## 7. Groeiplan (30/60/90 dagen, voorwaardelijk)

- **0–30 dagen:** alleen P0 en V6. Geen promotie vóór V1 t/m V4. Nulmeting (V12) en Search Console-controle.
- **30–60 dagen:** V7–V11, daarna een beperkte test met organisch delen (Instagram Reels/WhatsApp-kanaal) met goedgekeurde, handmatig gekozen berichten. Geen bots of gekochte volgers. Meetpunt: bezoeken per bron volgens Cloudflare Web Analytics.
- **60–90 dagen:** V14/V15 en nieuwsbriefonderzoek (V17). Betaalde promotie alleen beoordelen bij gemeten terugkeerpercentage; schalen alleen op meetgegevens.

Geen cijfers voor verwacht bereik: die zijn niet te onderbouwen zonder data.

## 8. Monetisatiegereedheid

Ontbreekt nog: uitgeversgegevens en contact (V4), privacyverklaring (V11), bronrechten (V1), consentoplossing (CMP, waar vereist) vóór elk advertentiescript, een archief of voldoende eigen inhoud (B7), en gereserveerde advertentieruimte (V18). De huidige CSP laat geen advertentiedomeinen toe en dat hoort zo te blijven tot er goedkeuring en een toetsing van CLS is.

## 9. Vervolgprioriteiten (gebruikerswaarde per kost)

1. V1, V4: vertrouwen en juridische basis; goedkoop.
2. V6: CI; goedkoop, voorkomt regressies.
3. V7/V8: publicatiekwaliteit; geen extra AI-kosten.
4. V14/V15: terugkerende lezers; geen backend nodig.
5. V9 en dossiers (V19) na besluit over #1067.

## 10. Uitgevoerde wijzigingen en validatie

Alleen dit rapport en `changelog.d/1236-master-audit.md`. Er is geen code gewijzigd. Validatie (18-11-2026, na herwerk): `npm test` eindigt met exitcode 0 (alle testbestanden "geslaagd") en `npm run build` slaagt (build-bronnen, `tsc --noEmit`, `vite build`).
