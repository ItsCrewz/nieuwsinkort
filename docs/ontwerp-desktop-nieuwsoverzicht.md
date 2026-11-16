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
3. **Sidebar** (vaste 320px, sticky): "Laatste nieuws" (8 nieuwste items op `t`, met tijd) en "Meest gelezen".

## Hoe het datamodel past

Geen nieuwe data of bronnen. Alles komt uit `items` van `/data.json` (`cat`, `kop`, `ai`, `tijd`, `t`, `bronnen`, `beelden`).

- **Hoofdartikel**: `max(bronnen.length)` binnen `cat === "nl"`, gelijkspel op nieuwste `t`.
- **Rubrieken**: filter op `cat`, gesorteerd op `t` aflopend.
- **Laatste nieuws**: alle items op `t` aflopend.
- **Meest gelezen**: er is **geen leesdata**. Voorstel: "Meest gelezen" wordt "Meest gemeld" = items met de meeste bronnen. **Open vraag aan Joey**: akkoord, of de sectie weglaten?
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

- Alle beelden in een container met `aspect-ratio: 16/9`; ruimte is er voordat het beeld laadt. Kaarten zonder foto krijgen géén beeldvak maar een vaste tekstkaart.
- Header en sidebarkoppen hebben vaste hoogtes; fonts zijn self-hosted (bestaande preload).
- Het aantal items per kolom is vast (4, 3 en 8), dus de hoogte verandert niet bij het laden. `/data.json` wordt vroeg gestart (`__vroegData`, #35); tot dan staan skeletons met dezelfde maten.
- De sidebar is `position: sticky` en verschuift de inhoud niet.
- De bestaande kaart-windowing (`KAARTEN_VOORAF`) is niet nodig: het overzicht heeft ca. 30 koppen.

## Fase 2 (niet in deze PR)

Implementatie in `src/`, een regressietest voor het 1024px-breakpoint op de echte app en een screenshotcontrole. Pas na akkoord op dit ontwerp.
