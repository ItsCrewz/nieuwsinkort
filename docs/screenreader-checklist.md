# Screenreader-checklist

Controleer op iOS met VoiceOver en op Windows met NVDA, met een recente browser. Noteer datum, apparaat, browserversie, screenreaderversie en eventuele bevindingen per controle.

- [ ] Tabs: doorloop de tabbalk, hoor de naam en geselecteerde tab en wissel van tab.
- [ ] Artikel: open een artikel, lees de inhoud en ga terug; controleer waar de focus terugkomt.
- [ ] Bronnen: open het Bronnen-venster, bedien een bron en sluit het venster; controleer focus en aankondigingen. Tab en Shift+Tab aan beide uiteinden lopen rond binnen het venster (#615), ook met veel bronnen en uitgeschakelde knoppen; Escape en sluiten brengen de focus terug naar de opener.
- [ ] Filmpjes: open de speler, bedien afspelen en geluid en ga naar een volgend filmpje.

## Resultaat

Bronnen-venster (#615), toetsenbord in de browser: `e2e/bronnen-focus.spec.mjs` is uitgevoerd op de Playwright-projecten `chromium` en `pixel` (Chrome 156, `PW_CHROME=/usr/bin/google-chrome`) en slaagt: de focus start op Sluit, Shift+Tab en Tab lopen rond over de ruim 20 bedienbare elementen (uitgeschakelde knop "Alles weer aan" valt erbuiten) en sluiten herstelt de focus naar de opener. Firefox is hier niet geïnstalleerd en is niet gedraaid.

Nog niet uitgevoerd: de screenreadercontrole met VoiceOver (iOS-apparaat nodig) en NVDA (Windows-apparaat nodig). Het vinkje bij Bronnen blijft daarom open. Leg de werkelijke resultaten hier vast zodra beide beschikbaar zijn.

Controle #615, 11 november 2026: nog niet uitgevoerd. In de testomgeving is geen screenreader beschikbaar en weigert de lokale browserproef het starten van de server (EPERM). Controleer daarom de bovenstaande toetsenbord- en screenreadergevallen op een geschikt apparaat en leg de resultaten hier vast.
