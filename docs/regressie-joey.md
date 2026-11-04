# Regressietests voor meldingen van Joey

Bewaar bij nieuwe meldingen het echte voorbeeld als fixture met uitsluitend itemdata, feedtitels of korte artikeltekst, zonder geheimen of persoonsgegevens. Bestaande tests hieronder blijven gelden; nieuwe tests staan in `tests/regressie/`.

| Datum melding | Melding | Issue / PR | Testbestand en testnaam | Status |
| --- | --- | --- | --- | --- |
| 4 november 2026 | Oude meer-cache toont Delft en NorthC bij Ahold | #508 | `tests/regressie/joey-meer-cache-508.test.ts`: “Worker en client negeren oude meer-cache voor Ahold” | Gedekt met echte itemdata en vooraf gevulde cache. |
| 4 november 2026 | Punten bij Ahold gaan over andere berichten | #508 | `tests/regressie/joey-punten-508.test.ts`: “Ahold: punten van andere berichten verdwijnen”; “schoorsteenbrand: relevant punt blijft” | Gedekt met echte itemdata. |
| 1 november 2026 | Florida-privéjet onder Nederland | #476 / #477 | `tests/regio.test.ts`: “Florida-item (kop, ai en omschrijving) is buitenland” | Gedekt met echte kop, RTL-link en eerste zin feedomschrijving. |
| 1 november 2026 | Florida-privéjet: kapotte AI-samenvatting | #476 / #477 | `tests/somcheck.test.ts`: “Florida-antwoord wordt afgekeurd (kern gelijk aan kop)”; `tests/kv-opslag.test.ts`: “#476 afgekeurde AI-som (geen externe keten): extractief ruw, markering in DO-opslag, volgende runs geen AI meer voor dat cluster” | Gedekt met echte AI-uitvoer; de integratietest gebruikt een testlink. |
| 1 november 2026 | Wolf Bram vijf keer apart | #469 / #472 | `tests/cluster-eigennamen.test.ts`: “wolf Bram: vijf bronnen worden één cluster, in elke volgorde” | Gedekt met `tests/fixtures/wolf-bram-feeds.json`, vijf echte feedberichten. |
| 30 oktober 2026 | Terugvegen springt naar het volgende filmpje | #348 / #356 | `tests/regressie/joey-swipe-terug-348.test.ts`: “terugvegen langs geblokkeerde YouTube-video blijft achteruit gaan” | Beslislogica gedekt; de melding bevat geen bewaarde video-identificatie of concrete foutcode. De test gebruikt daarom alle vier ondersteunde foutcodes en een gereconstrueerde volgorde, geen echte videofixture. |
| 2 november 2026 | Dubbele secties | #488 | `tests/regressie/joey-dubbel*` | Test wordt afzonderlijk gemaakt. |
| 2 november 2026 | Kernfeit iPad mini | #488 | `tests/regressie/joey-kernfeit*` | Test wordt afzonderlijk gemaakt. |
| 2 november 2026 | iCulture als kanaal | #488 | `tests/regressie/joey-bron*` | Test wordt afzonderlijk gemaakt. |
| 4 november 2026 | Onverklaarde vette letterstukjes door naamloze Focus-schakelaar op mobiel | #507 | `tests/regressie/joey-focus-507.test.ts`: “Focus-lezen maakt alleen ingeschakeld woorddelen vet”; “Focus-label blijft mobiel zichtbaar” | Gedekt met de twee gemelde teksten; de labeltest faalde op de oorspronkelijke CSS. |
| 4 november 2026 | Bekendmaking toont alleen een soortlabel | #510 | `tests/regressie/joey-bekendmaking-510.test.ts`: “soortlabel wordt eerlijke bronverwijzing”; “echte ruwe tekst blijft behouden” | Gedekt met het gemelde item en een echt ruw item met tekst. |
