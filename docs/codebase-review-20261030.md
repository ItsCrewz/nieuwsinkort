# Codebase-review nieuwsinkort (30-10-2026, #298)

Review van `src/`, `worker/src/`, `functions/` en `scripts/` op basis van `origin/main` `b4d9782`, uitgevoerd met Claude Opus. Er is geen code gewijzigd: dit rapport is alleen een lijst met refactors. Elke refactor in de lijst onderaan laat het gedrag ongewijzigd. Waar dat niet vanzelf spreekt, staat erbij wat gelijk moet blijven.

Methode: per export met grep gezocht naar gebruik buiten het eigen bestand, CSS-klassen en keyframes vergeleken met `src/**/*.ts(x)` en `index.html`, en docs naast de code gelegd. Gebruikt is dat alleen als het daarna ook gelezen is. Twee deelanalyses (grote bestanden, docs vs code) zijn steekproefsgewijs nagelopen. Twee claims daaruit bleken niet te kloppen en zijn geschrapt:
- `console.log` in `src/feed.tsx:662` staat wél achter `DEBUG`.
- `NIET_ALS_NIEUWS` (`worker/src/index.ts:295`) en `nietAlsNieuws` (`worker/src/showcat.ts:19`) zijn verschillende regels.

Checks op deze stand: `npm test` groen (exit 0), `npm run build` groen (exit 0). Bundels:
- `index` 274,96 kB (gzip 89,23 kB)
- `hls` 575,28 kB (gzip 179,26 kB)
- css 50,25 kB (gzip 11,77 kB)

Er is niets aan de code veranderd, dus de meting vóór is gelijk aan de meting na.

## 1. Dode code

| Wat | Waar | Opmerking |
|---|---|---|
| `ytSkipBesluit` | `src/ytstart.ts:39` | Alleen nog gebruikt in `tests/ytstart.test.ts:47-52`. De productiecode gebruikt sinds #348 `ytVerwijderBesluit`. |
| CSS `.d-quote` | `src/index.css:641` | Nergens gebruikt. |
| CSS `.fit-nonum`, `.nc-num` | `src/index.css:476,480` | Kaartnummer wordt niet meer gerenderd. |
| `@keyframes rise`, `sink` | `src/index.css:375-376` | Niet gebruikt in CSS, Tailwind-config of TSX. |
| Onnodige `export` op intern gebruikte namen | o.a. `src/buffer.ts` (`Niveau`, `Netwerk`), `src/framegezondheid.ts` (`FrameBesluit`, `VAST_MS`, `VAST_KLOK`), `src/regio.ts` (`NL_ANKER`, `Signaal`), `src/types.ts` (`Bron2`), `src/videopool.ts` (`PoolSlot`), `src/ytstart.ts` (`YtStart`), `src/feed.tsx` (`SeekApi`, `FeedGroup`), `src/filters.tsx` (`Tijd`, `Regio`, `heeftVideo`), `src/video.tsx` (`SOORTEN`, `useTouch`), `worker/src/ai.ts` (`KetenFout`, `DiepIn`), `worker/src/budget.ts` (`BudgetEnv`), `worker/src/tabsam.ts` (`TabArtikel`, `TabSam`), `worker/src/videos.ts` (`IgPost`), `worker/src/weer.ts` (`KNMI_WAARSCH`), `worker/src/x.ts` (`XPost`) | Geen import buiten het eigen bestand, ook niet in tests. De Durable Object-klassen `Fetcher`, `Runner` en `Budget` móéten geëxporteerd blijven, ook al importeert niemand ze. |
| Re-exports in `worker/src/budget.ts:6` | `isDagQuota`, `isTijdelijk`, `meetChat`, `meetFout`, `type Meting` | Er wordt alleen geïmporteerd: `Budget`, `utcDag`, `neuronFactor`, `aiFout`, `nieuwsNeuronen`, `zetDagTeller` en `quotaSleutel` (`worker/src/index.ts:26`). `worker/src/ai.ts` haalt de andere namen direct uit `src/budget`. |

npm-dependencies: alle `dependencies` en `devDependencies` (root en `worker/`) worden gebruikt. Tailwind en autoprefixer lopen via `postcss.config.js`, vitest via `npm run coverage`. Ongebruikte bestanden: geen. `scripts/meet-swipe.mjs` (#254) staat alleen nergens in de docs.

## 2. Duplicatie

| Wat | Waar | Kan samen? |
|---|---|---|
| `soortVan` + `JOURNAAL_RE` | `src/video.tsx:51-59` en `worker/src/videos.ts:160-168`, letterlijk gelijk. Er is ook een Python-port in `scripts/pipeline/filmpjes.py:90-98`. | Ja, naar een pure module in `src/` (zoals `slug.ts`). De Python-port blijft, met een verwijzing in commentaar. |
| `motionOK` | `src/App.tsx:57`, `src/feed.tsx:14`, `src/sheet.tsx:31` | Ja, één helper. |
| `RATES` en modelnamen | `functions/samenvatting.ts:18,36` en `worker/src/ai.ts:4` | Alleen de tabel en de namen. `chat()` in `samenvatting.ts` werkt alleen met Cloudflare, de Worker-versie gebruikt een Groq/Mistral-keten. Die twee samenvoegen verandert gedrag en het neuronbudget. |
| `ams()` | `functions/samenvatting.ts:61` is een subset (`iso`, `h`) van `src/tijd.ts:4` | Ja, de uitkomst is gelijk. |
| `slugify` | `src/App.tsx:37` | Hoort bij `src/slug.ts`. |
| UA-strings | `nieuwsinkort/1.0 (+…)` letterlijk in `worker/src/index.ts:60`, `worker/src/x.ts:29` en `worker/src/llm.ts:41,55`. `BR_UA` staat twee keer, met een verschil: `Chrome/130.0` (`index.ts:173`) en `Chrome/130` (`x.ts:13`). | Ja, één module met constanten. Neem de twee `BR_UA`-waarden letterlijk over of trek ze bewust gelijk. |
| YouTube-ID-regexes | `src/slug.ts:4` (`{6,}`), `worker/src/videos.ts` `ytVideoId`, `functions/samenvatting.ts:65` `ytId` (precies 11), `worker/src/reddit.ts:19-20` | **Niet samenvoegen**: de regels verschillen, dus samenvoegen verandert gedrag. Wel de verschillen vastleggen in een test. |
| Ontdubbelen in Python | `scripts/pipeline/filmpjes.py:347-412` is een port van `src/dedup.ts` | Kan niet gedeeld worden. Wel een verwijzing en een gedeelde fixture. |
| `YT_NIEUWS`, `REDDIT_SUBS`, `IG_UA` | `worker/src/videos.ts:5,22`, `worker/src/index.ts:71` en `scripts/pipeline/filmpjes.py` | Dubbel bijgehouden. Lage prioriteit. |
| Dubbele import van `src/regio` | `worker/src/index.ts:24` en `:29` | Samenvoegen tot één regel. |

Al goed gedeeld: budgetlogica (`src/budget.ts` met de DO-shell `worker/src/budget.ts`), `dedup`, `beeld`, `tijd`, `vandaag`, `slug`, `regio` en `kv`. `src/kv.ts` wordt alleen door de Worker en de tests gebruikt. Dat mag zo blijven.

## 3. Bestanden boven 400 regels

De aantallen in het issue zijn verouderd. Huidige stand: `src/feed.tsx` 1627, `src/App.tsx` 1476, `worker/src/index.ts` 874, `scripts/pipeline/filmpjes.py` 477, `functions/samenvatting.ts` 430.

- **`src/App.tsx`** heeft deze secties:
  - helpers en module-state (25-74)
  - weer (75-211)
  - `Briefing`/`Tabs` (212-398)
  - nieuwslijst (399-532)
  - kaartenfeed met `KAARTEN_VOORAF`/`VOORUIT` (533-819)
  - detail en "Lees verder" met `meerCache`/`useMeer` (820-991)
  - `useData` en thema (992-1069)
  - schil met `App` (1070-1476)

  Er is geen test die de componenten direct importeert.
- **`src/feed.tsx`** heeft deze secties:
  - `useBar` (35-64)
  - de ready-singletons en `maakPool` (85-134)
  - `NativePlayer` (145-683, ~540 regels)
  - `YouTubePlayer` (684-879)
  - `Scrub` (880-971)
  - `Slide` (989-1102)
  - video-samenvatting (1103-1195)
  - `Feed` (1197-1627)

  De pool, het voorladen en de drie spelers blijven zoals ze zijn (keuze Joey). Daarom stel ik hier alleen extracties voor die er los van staan.
- **`worker/src/index.ts`**: job-runners en `runJob`/`Fetcher` (68-294). `Runner.run()` is ongeveer 480 regels (344-824) met duidelijke fasen: jobs, kandidaten, AI-trappen, items, video's, foto's, Lees verder, In het kort, weer, wegschrijven. Daarna komen `hash`/`toegelaten` (825-841).
- **`functions/samenvatting.ts`**:
  - `RATES` en `chat` (17-29)
  - captions en audio: `ytCaptions`, `hlsAudio`, `mp4Audio`, `groqAudio` (68-193)
  - `Poort` met DO/KV (215-271)
  - handlers (272-430)
- **`scripts/pipeline/filmpjes.py`**: config (33-112), ophalen per bron (147-346), ontdubbelen (347-412) en `main`. Er zijn geen tests.

## 4. Inconsistente patronen

- **Foutafhandeling.** Lege `catch {}` en `.catch(() => {})` komen 48 keer voor in `src`, `worker/src` en `functions`, tegenover 36 keer `console.error`/`warn`.
  - Voor `play()` en DOM-API's is stil afvangen bewust. In `worker/src/index.ts:89-151,327-355` en `functions/samenvatting.ts:241-415` is het vaak onduidelijk of het bewust is.
  - `functions/samenvatting.ts:286` logt "fout bij fallback" bij ongeldige JSON in de body. Die tekst is misleidend.
- **Fetch-helpers in de Worker.** Er zijn drie helpers, elk met een eigen timeout en eigen headers: `get()` (`index.ts:174`), `igGet()` (`index.ts:72`) en `externeFetch()` (`worker/src/url.ts:13`). Daarnaast staan er losse `fetch`-aanroepen in `index.ts:150,207,350-351`, `x.ts`, `llm.ts` en `vooraf.ts:31,46`. `vooraf.ts` gebruikt een eigen UA `nieuwsinkort-uur/vooraf` en haalt `data.json` op zonder UA.
- **Naamgeving NL/EN.** Engelse namen (`WeatherBox`, `NewsFeed`, `pickLead`, `useTheme`, `useBar`, `signalReady`) staan naast Nederlandse (`KaartInhoud`, `MeerTekst`, `maakPool`, `herstel`). Advies: geen bulk-rename. Gebruik Nederlandse namen in nieuwe code, en hernoem alleen wanneer code toch al naar een ander bestand verhuist.
- **State.** `src/App.tsx` heeft 32 en `src/feed.tsx` 72 `useState`/`useRef`. Er is mutable module-state: `openedInside`, `feedPushed`, `introDone` (`App.tsx:30-34`), `meerCache`, `svCache`, `activeReady`/`waiters` (`feed.tsx:85-116`) en `redlibN` (`index.ts:182`). Wie code extraheert moet deze singletons meeverhuizen en mag ze niet kopiëren.
- **Kleine interfaces** (`KV`, `Env`) staan per Pages Function opnieuw gedefinieerd. Dat volgt de conventie in CLAUDE.md, dus het is geen issue.

## 5. Docs vs code

| Doc | Klopt niet | Code |
|---|---|---|
| `AGENTS.md:24` | `buffer.ts` zou "nog niet in `feed.tsx` gekoppeld" zijn, met "vanaf +4 niets" en "Save-Data = alleen playlist" | `src/feed.tsx:22` gebruikt `planVoor`; `src/buffer.ts:12-19` geeft 30 s / 60 MB voor de actieve speler en 12/6/2 s voor de volgende |
| `AGENTS.md:37-38` | Bij Save-Data/2G zou alleen de actieve speler laden, met HLS ~4 s/2 s | `src/videopool.ts:4-12` geeft altijd de actieve en de volgende speler een bron; grenzen zoals in CLAUDE.md "Direct starten" |
| `AGENTS.md:40` | `src/netwerk.ts` met niveaus geen/zuinig/normaal | Het bestand bestaat niet; vooraf laden is op alle verbindingen gelijk (`src/voorladen.ts`) |
| `AGENTS.md:22`, `CLAUDE.md:21` | `npm run build` zonder `build-version.mjs` | `package.json` (`scripts.build`) |
| `CLAUDE.md` (Vooraf laden) | "Wijzig `feed.tsx`-`warmHls` en dit samen" | `warmHls` bestaat alleen nog in `src/voorladen.ts:92`; in `feed.tsx` laadt `NativePlayer` hls.js zelf |
| `CLAUDE.md` (Neuronbudget) | "≥ 100%: geen AI, feedtekst met `ruw: true`" | Volgens AGENTS.md:11 en docs/architectuur.md:120-122 is er bij ≥100% een terugval op Groq/Mistral of extractieve tekst (`worker/src/index.ts:534`, `extractief.ts`) |
| `CLAUDE.md` (Waar staat wat) | Lijst `worker/src/` en `scripts/` onvolledig | Ontbreken: `llm.ts`, `extractief.ts`, `tabsam.ts`, `clusterhash.ts`, `run-status.ts`, `showcat.ts`, `sportcat.ts`, `url.ts`, `reddit.ts`; en in `scripts/`: `build-version.mjs`, `changelog.mjs`, `check.sh`, `run-tests.mjs`, `coverage-groepen.mjs`, `feedtitels.mts`, `meet-swipe.mjs` |
| `CLAUDE.md`, `README.md:98` | Link `architectuur.md#beveiligingsheaders` | Die kop bestaat niet in `docs/architectuur.md` |
| `docs/ai-budget.md:3` | Link `#workers-ai-en-budget` | De kop heet "Tekst-AI en budget" (`docs/architectuur.md:109`) |
| `docs/ai-budget.md:37,41` | De tabel met `chat()`-gebruikers mist de tabsamenvattingen | `worker/src/tabsam.ts` (`tabTekst`) |
| `scripts/pipeline/README.md:18-21` | Standaard `/workspace/nieuws/feeds.json` | `scripts/build-bronnen.mjs:12-19`: standaard `scripts/pipeline/`, met een waarschuwing bij een extern pad |
| `docs/architectuur.md:154,186` | `scripts/pipeline/` zou "nog niet op `main`" staan | De map staat op `main` en is de standaard |
| `docs/architectuur.md:91` | Bindings: alleen `NIEUWS` en `AI` | Root-`wrangler.toml` heeft ook `BUDGET_DO` |
| `docs/architectuur.md:105` | Zin over vergelijken per clusterlid staat er twee keer | — |
| `changelog.d/75-*`, `76-*`, `77-*` | Reddit, Instagram en X zouden "verwijderd" zijn | Teruggezet in #139 (`changelog.d/139-*`); de code haalt ze op (`worker/src/index.ts:376-381`). Er staan dus twee tegenstrijdige fragmenten tegelijk in `changelog.d/`. |
| Herhaalde blokken | KV-schrijflimiet, deploy-integriteit en runfouten staan bijna woordelijk in CLAUDE.md, AGENTS.md, README.md en docs/architectuur.md | De inhoud klopt, maar de kans dat de kopieën uit elkaar lopen is groot |

Wel gecontroleerd en in orde:
- `BUDGET` 9000, `CAP` 40 en de tiers 70/90/85/65 %
- `MAX_WHISPER_UUR` 30, `SLOT_TTL` 90 s en 30 og-links
- `KAARTEN_VOORAF`/`VOORUIT`
- vooraf laden: 6 thumbnails, 3 tegelijk, 2 HLS-streams en 256 KB
- modellen en tarieven
- de buffergrenzen in CLAUDE.md
- alle testbestanden die in de docs genoemd worden

## 6. Uitkomst: refactor-issues

Elke refactor laat het gedrag ongewijzigd en is één PR op `origin/main`. Draai `npm test` en `npm run build` vóór en na. Omvang: XS < 20 regels, S < 80, M < 300, L ≥ 300 (verplaatst of geraakt).

1. **Dode export `ytSkipBesluit` en de bijbehorende tests verwijderen**
   - Bestanden: `src/ytstart.ts`, `tests/ytstart.test.ts`
   - Omvang: XS. Risico: laag.
2. **Ongebruikte CSS verwijderen**
   - Wat: `.d-quote`, `.fit-nonum`/`.nc-num` en `@keyframes rise`/`sink`
   - Bestanden: `src/index.css`
   - Omvang: XS. Risico: laag. Controleer eerst dat er geen dynamische klassenaam is (grep op `nonum`, `quote`).
3. **Overbodige `export`-sleutelwoorden weghalen en ongebruikte re-exports in `worker/src/budget.ts` schrappen**
   - Bestanden: zie de tabel in §1
   - Omvang: S. Risico: laag. De DO-klassen blijven geëxporteerd. `npm run check` vangt fouten.
4. **Dubbele `src/regio`-import in de Worker samenvoegen**
   - Bestanden: `worker/src/index.ts`
   - Omvang: XS. Risico: laag.
5. **`motionOK` op één plek**
   - Bestanden: `src/ui.tsx` (of een nieuwe `src/beweging.ts`), `src/App.tsx`, `src/feed.tsx`, `src/sheet.tsx`
   - Omvang: XS. Risico: laag.
6. **`soortVan`/`JOURNAAL_RE` delen tussen frontend en Worker**
   - Bestanden: een nieuwe `src/soort.ts`, `src/video.tsx`, `worker/src/videos.ts`, `tests/videos.test.ts`, commentaar in `filmpjes.py`
   - Omvang: S. Risico: laag. Voeg een test toe die beide aanroepers op dezelfde fixtures controleert.
7. **`slugify` naar `src/slug.ts`**
   - Bestanden: `src/App.tsx`, `src/slug.ts`, plus een test in `tests/slug.test.ts`
   - Omvang: XS. Risico: laag.
8. **`ams()` in de samenvatting-Function vervangen door `src/tijd.ts`**
   - Bestanden: `functions/samenvatting.ts`
   - Omvang: XS. Risico: laag. `iso` en `h` zijn gelijk.
9. **`RATES` en modelnamen één keer definiëren**
   - Alleen de tabel en de constanten, niet `chat()`.
   - Bestanden: `worker/src/ai.ts`, `functions/samenvatting.ts`
   - Omvang: S. Risico: laag-middel. Het neuronbudget hangt hiervan af: bedragen identiek houden. Tests: `budget-meting`, `samenvatting-*`.
10. **UA-constanten centraliseren in de Worker**
    - Bestanden: een nieuwe `worker/src/ua.ts`, `worker/src/index.ts`, `worker/src/x.ts`, `worker/src/llm.ts`
    - Omvang: S. Risico: laag. Neem beide `BR_UA`-varianten letterlijk over; gelijktrekken hoort in een apart issue.
11. **Video-samenvatting uit `feed.tsx` halen**
    - Wat: `svCache`, `zaaiSamenvattingen`, `haalSamenvatting`, `SamenvattingKnop`, `SamenvattingBlad`
    - Bestanden: een nieuwe `src/videosamenvatting.tsx`, `src/feed.tsx`, `src/App.tsx` (import)
    - Omvang: S (~95 regels). Risico: laag. Raakt pool, spelers en voorladen niet.
12. **Weer-UI en nieuwslijst uit `App.tsx` halen**
    - Bestanden: nieuwe `src/weer-ui.tsx` (75-211) en `src/nieuwslijst.tsx` (399-532), `src/App.tsx`
    - Omvang: M (~270 regels verplaatst). Risico: laag (alleen presentatie).
13. **Detail en "Lees verder" uit `App.tsx` halen**
    - Bestanden: een nieuwe `src/detail.tsx` (820-991), `src/App.tsx`
    - Omvang: M (~170). Risico: laag-middel. `meerCache` moet één singleton blijven.
14. **Kaartenfeed (`NewsFeed`/`NewsCard`/`fitCard`) uit `App.tsx` halen**
    - Bestanden: een nieuwe `src/nieuwsfeed.tsx`, `src/App.tsx`, mogelijk `tests/laadprestaties.test.ts` (die test controleert bronteksten)
    - Omvang: M (~290). Risico: middel. De constanten van #35, `data-id` en `aria-label` blijven gelijk.
15. **`useData` en thema in eigen modules**
    - Bestanden: nieuwe `src/usedata.ts` en `src/thema.ts`, `src/App.tsx`
    - Omvang: S (~80). Risico: middel. Hangt samen met `src/vroeg.ts`. Raak `index.html` niet aan, anders verandert de CSP-hash.
16. **Job-runners uit de Worker-entry halen**
    - Wat: `runInsta`, `runOg`, `runArt`, `runArtJ`, `runX`, `get`, `viaRedlib`, `runJob`
    - Bestanden: een nieuwe `worker/src/jobs.ts`, `worker/src/index.ts`
    - Omvang: M (~200). Risico: laag-middel. `redlibN` verhuist mee. `Fetcher` blijft vanuit `index.ts` geëxporteerd.
17. **Auth-hulpfuncties `hash`/`toegelaten` naar een eigen module**
    - Bestanden: een nieuwe `worker/src/auth.ts`, `worker/src/index.ts`
    - Omvang: XS. Risico: laag. Test: `tests/worker-run.test.ts`.
18. **`Runner.run()` opdelen in fasefuncties met een expliciete context**
    - Eerst Lees verder (637-741) en de AI-trappen (493-554).
    - Bestanden: `worker/src/index.ts`, nieuwe `worker/src/leesverder.ts` en `worker/src/ai-trap.ts`
    - Omvang: L. Risico: middel-hoog. `usage`, `kvWrites`, `st` en `R` worden gedeeld; neuronbudget en KV-teller mogen niet verschuiven. Pas na 16. Tests: `worker-run`, `showbizz-run`, `kv-schrijven`, `run-status`.
19. **Captions- en audio-helpers uit de samenvatting-Function halen**
    - Bestanden: `functions/samenvatting.ts` en een nieuwe module buiten de routing van Pages, bijvoorbeeld `src/` of `worker/src/`
    - Omvang: M (~125). Risico: laag. Controleer vooraf hoe Pages bestanden onder `functions/` routeert.
20. **`Poort` (DO/KV-slot) apart zetten**
    - Bestanden: `functions/samenvatting.ts`, een nieuwe module
    - Omvang: S (~60). Risico: middel. Slot- en reserveringssemantiek gelijk houden. Tests: `samenvatting-slot`, `samenvatting-do`.
21. **Fetch-helper voor de Worker**
    - Wat: één `haal(url, { ua, timeout, accept })` voor `get`/`igGet` en de losse aanroepen. `externeFetch` blijft de URL-controle doen.
    - Bestanden: `worker/src/index.ts`, `worker/src/x.ts`, `worker/src/vooraf.ts`
    - Omvang: M. Risico: middel. Headers en timeouts per aanroep moeten exact gelijk blijven; leg ze eerst vast met fetch-mocks.
22. **Stille catches in Worker en Functions beoordelen**
    - Wat: een kort commentaar waar stil afvangen bewust is, en een vaste `console.error`-context waar een fout nu ongezien verdwijnt. Daarnaast de foutmelding op `samenvatting.ts:286` corrigeren.
    - Bestanden: `worker/src/index.ts`, `functions/samenvatting.ts`
    - Omvang: S. Risico: laag. Responsen blijven gelijk, alleen de logs veranderen.
23. **Afwijkende YouTube-ID-regexes vastleggen in een test**
    - Wat: niet samenvoegen, alleen het verschil tussen `youtubeId` (`{6,}`), `ytVideoId`, `ytId` (precies 11) en `reddit.ts` vastleggen, met commentaar.
    - Bestanden: tests en commentaar
    - Omvang: S. Risico: geen.
24. **`filmpjes.py` opsplitsen**
    - Wat: ontdubbelen naar `ontdubbel.py` met een verwijzing naar `src/dedup.ts`, en bare `except Exception:` voorzien van een log
    - Bestanden: `scripts/pipeline/`
    - Omvang: S. Risico: laag. Er zijn geen tests; vergelijk vóór en na de uitvoer op een vaste invoer.
25. **Rooktests vóór de grote extracties**
    - Wat: een minimale render van `App` en `Feed` met de bestaande stubs (zoals in `sources-hooks.test.ts`), zodat 12 tot 15 niet alleen op tsc steunen
    - Bestanden: `tests/`
    - Omvang: S-M. Risico: laag.
26. **Docs gelijktrekken met de code (AGENTS.md en CLAUDE.md)**
    - Wat: de buffer-, pool- en voorlaadregels, `netwerk.ts`, `warmHls`, de beschrijving van `npm run build`, de ≥100%-trap en de modulelijsten (zie §5)
    - Bestanden: `AGENTS.md`, `CLAUDE.md`
    - Omvang: S. Risico: geen.
27. **docs/ en de pipeline-README bijwerken**
    - Wat: de ankers `#beveiligingsheaders` en `#tekst-ai-en-budget`, de `chat()`-tabel met `tabsam.ts`, de standaard `FEEDS_JSON`, "nog niet op main", `BUDGET_DO` en de dubbele zin
    - Bestanden: `docs/architectuur.md`, `docs/ai-budget.md`, `scripts/pipeline/README.md`, `README.md`
    - Omvang: S. Risico: geen.
28. **Herhaalde docblokken terugbrengen tot één bron**
    - Wat: KV-schrijflimiet, deploy-integriteit en runfouten alleen nog in `docs/architectuur.md`, met elders een link
    - Bestanden: `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/architectuur.md`
    - Omvang: S. Risico: laag. CLAUDE.md wordt door agents gelezen; houd daar de harde regels.
29. **Tegenstrijdige changelog-fragmenten 75/76/77 en 139 rechtzetten vóór `npm run changelog`**
    - Bestanden: `changelog.d/`
    - Omvang: XS. Risico: geen. Dit is werk voor de coördinator.

Bewust niet op de lijst:
- Het opsplitsen van `NativePlayer`/`YouTubePlayer`/`Slide`/`Feed`, de pool en het voorladen. Die blijven zoals ze zijn (keuze Joey, 13:40). Dat kan alleen in een aparte PR na akkoord, met een handmatige test op `/?debug=1#/dumpert`.
- Een bulk-rename van NL/EN-namen.
- De socials zelf (productkeuze, #139).
