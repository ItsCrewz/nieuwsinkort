# Ontwerpvoorstel: desktop nieuwsoverzicht (#1067, fase 1)

Status: **voorstel voor akkoord van Joey**. Er is nog niets gebouwd in de app; fase 2 volgt pas na akkoord. Mockup: [mockups/desktop-nieuwsoverzicht.html](mockups/desktop-nieuwsoverzicht.html) (zelfstandig, zonder script of externe requests, met echte kopjes uit `public/data.json`; open hem breder dan 1024px).

## Scope en breakpoint

- Alleen schermen vanaf `min-width: 1024px`. Eén breakpoint, geen tussenvormen.
- Onder 1024px verandert niets: de swipe-/scrollfeed blijft zoals nu. Het desktopoverzicht is een aparte tak die alleen rendert bij `matchMedia("(min-width: 1024px)")`; de mobiele componenten en hun gedrag blijven onaangeraakt.
- Filmpjes en Dumpert (#67) blijven zoals ze zijn; de header linkt ernaar.

## Layout (≥1024px)

Container max 1240px, gecentreerd, 24px zijmarge.

1. **Header**: logo links, daarnaast `<nav aria-label="Rubrieken">` met Nederland, Tech, Showbizz, Haarlem, Filmpjes, Dumpert. Hoogte vast 64px.
2. **Hoofdkolom** (flexibel) met links daarvan:
   - **Hoofdartikel**: het cluster met de meeste bronnen in cat `nl`. Beeld 16:9 links (3/5), kop (2rem), `ai`-regel en bronnen/tijd rechts (2/5).
   - **Drie secundaire kaarten** eronder: de volgende `nl`-clusters.
   - **Drie rubriekkolommen** (Tech, Showbizz, Haarlem) met elk de nieuwste 4 koppen.
3. **Sidebar** (vaste 320px, sticky): "Laatste nieuws" (8 nieuwste items op `t`, met tijd) en "Meest gemeld" (alleen items met minstens 2 bronnen; zonder zulke items vervalt de sectie).

## Hoe het datamodel past

Geen nieuwe data of bronnen. Alles komt uit `items` van `/data.json` (`cat`, `kop`, `ai`, `tijd`, `t`, `bronnen`, `beelden`).

- **Hoofdartikel**: `max(bronnen.length)` binnen `cat === "nl"`, gelijkspel op nieuwste `t`.
- **Rubrieken**: filter op `cat`, gesorteerd op `t` aflopend.
- **Laatste nieuws**: alle items op `t` aflopend.
- **Meest gemeld**: er is **geen leesdata**, dus geen "Meest gelezen". Voorstel: "Meest gemeld" = items met de meeste bronnen (minstens 2). **Open vraag aan Joey**: akkoord, of de sectie weglaten?
- Het bestaande rubriekenfilter (`filters.tsx`, `sources.ts`) en `herindeel()` blijven de bron van waarheid voor wat in welke rubriek valt.

## Hergebruik van componenten

`Tabs` (nav-gedrag en actieve rubriek), `WeatherBox` (onder de sidebar of in de header), `Item`-delen voor kop, bronnenregel en veilige links (`veiligeUrl()`), `beelden.tsx`/`beeld.ts` voor foto's en beeldproxy. Nieuw zijn alleen de layoutcomponenten voor header, hoofdartikel, kolom en sidebar. Geen nieuwe dependencies.

## Typografie

Inter (self-hosted, al aanwezig). Hoofdkop 2rem/1.2 bold; kaartkop 1rem/1.3 semibold; rubriekkop 1.125rem met rode onderlijn; meta 0.8125rem in `--muted`. Contrast minimaal 4,5:1.

## Toetsenbordtoegankelijkheid

- Focusvolgorde = leesvolgorde: skip-link, header/nav, hoofdartikel, secundaire kaarten, rubriekkolommen, sidebar.
- Skip-link "Naar de inhoud" als eerste focusbare element, springt naar `<main id="inhoud" tabindex="-1">` (zelfde patroon als de bestaande `.skip`).
- Landmarks: `<header>`, `<nav aria-label="Rubrieken">`, `<main>`, `<aside aria-label="Zijbalk">`; elke rubriek een `<section aria-labelledby>` met een `h2`; koppen zijn `h3` in een link.
- Elke kaart heeft één link (de kop), dus geen dubbele tabstops. Zichtbare focusring (3px, offset 2px). Geen hover-only informatie.

## Geen CLS-regressie

Doel: bij het vervangen van skeleton of leegtoestand door inhoud verschuift niets.

- **Beelden**: container met `aspect-ratio: 16/9`; de ruimte staat er voordat het beeld laadt. Een kaart zonder beeld krijgt géén beeldvak maar een vaste tekstkaart, en wisselt na het laden niet van vorm.
- **Variabele koplengte**: koppen krijgen `line-clamp` (hoofdkop 4 regels, kaartkop 3 regels) met een vaste `min-height` (3,9em voor kaartkoppen), zodat een korte of lange kop dezelfde hoogte inneemt.
- **Minder artikelen dan slots**: een kolom met minder items dan slots (4, 3 of 8) houdt de hoogte van alle slots; lege slots zijn onzichtbare plaatshouders met dezelfde maat.
- **Lege rubriek**: een rubriek zonder items toont één vaste regel "Geen berichten" in plaats van te inklappen. Alleen "Meest gemeld" vervalt als er geen items met minstens 2 bronnen zijn; de sidebar heeft dan een vaste minimale hoogte.
- **Laden en fouten**: skeletons en de foutmelding hebben dezelfde maten als de inhoud (zelfde slots, dezelfde clamp en `min-height`). `/data.json` wordt vroeg gestart (`__vroegData`, #35).
- **Sidebar**: 8 rijen van vaste hoogte (`min-height: 3.5rem`), `position: sticky`; header en sidebarkoppen hebben vaste hoogtes en fonts zijn self-hosted (bestaande preload).
- De bestaande kaart-windowing (`KAARTEN_VOORAF`) is niet nodig: het overzicht heeft ca. 30 koppen.

## Fase 2 (niet in deze PR)

Implementatie in `src/`, een regressietest voor het 1024px-breakpoint op de echte app en een screenshotcontrole. Pas na akkoord op dit ontwerp.
