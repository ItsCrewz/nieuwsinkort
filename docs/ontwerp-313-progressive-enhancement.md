# Ontwerpnotitie #313: nieuws zonder JavaScript

Status: voorstel, geparkeerd. Er is geen wijziging aan de site gedaan.

`/data.json` combineert de statische routinegegevens met de uurdata uit KV en filtert op de Amsterdamse dag. Een bouwstap die `public/data.json` in HTML zet, zou na een uurrun andere en mogelijk oude berichten tonen. De huidige bouwdata is bovendien niet noodzakelijk van vandaag. Dat voldoet niet aan de eis om dezelfde inhoud als `/data.json` te tonen.

Een mogelijke oplossing is een Pages Function voor de homepage die dezelfde gegevensbereiding als `/data.json` gebruikt en de briefing en maximaal tien koppen met veilige bronlinks in `<noscript>` plaatst. De HTML moet teksten en attributen escapen, en bij ontbrekende actuele berichten geen oude inhoud verzinnen. De functie moet ook caching, foutafhandeling en de bestaande beveiligingsheaders voor de HTML behouden. React gebruikt `createRoot`, dus er is geen hydratie; inhoud in `<noscript>` beïnvloedt de layout met JavaScript aan niet. Dit helpt de LCP-tekst met JavaScript aan echter niet.

Dit maakt van de statische homepage een serverrespons die op KV en gegevensverwerking wacht. Dat raakt de kritieke laadroute en vereist aparte tests voor dezelfde data, fouten, headers en cachegedrag, plus een representatieve prestatiemeting en controle op iPhone-emulatie. Een alternatief is bij iedere uurrun HTML genereren, maar ook dat vereist een nieuwe publicatie- en fallbackroute en moet rekening houden met het dagfilter. Beide ingrepen zijn groter dan een kleine, gerichte wijziging in de stabilisatiefase.

De beschikbare live nulmeting van 30 oktober 2026 heeft een mediane mobiele Lighthouse-performance van 89, LCP van 3363 ms en CLS van 0; de mediane TTFB is 352 ms voor `/` en 667 ms voor `/data.json`. Deze metingen bewijzen niet hoe de voorgestelde serverroute zal presteren. Vergelijk vóór invoering drie vergelijkbare metingen vóór en na, controleer CLS ≤ 0,01 en minimaal tien actuele koppen zonder JavaScript, en voer de gevraagde live controle op iPhone-emulatie uit. Zonder netwerk en deploy zijn een vergelijkbare nameting en live controle hier niet mogelijk.

Voor invoering is een besluit nodig over deze grotere ingreep en de gewenste fallback als actuele data ontbreekt. Rollback kan bestaan uit terugzetten van de homepage naar de statische HTML en verwijderen van de bijbehorende Function; uitrollen en terugdraaien vereisen afzonderlijk deployakkoord.
