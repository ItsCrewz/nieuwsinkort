# Weigerzinnen

Het filter voor AI-weigeringen in `worker/src/weigering.ts` herkent gerichte Nederlandse en Engelse uitspraken over ontbrekende brontekst of het niet kunnen samenvatten. Een nieuwsfeit over ontbrekende informatie of een weigering van een persoon is geen reden om een bericht te verwijderen. Voeg voorbeelden van beide kanten toe aan de regressietest bij aanpassing van de patronen. Bij twijfel blijft een bericht staan.

Alleen kern, samenvatting en punten worden gecontroleerd, niet de kop. Een zin met een citaat, bronvermelding of spreekwerkwoord blijft behouden; andere zinnen in hetzelfde veld worden afzonderlijk gecontroleerd. De patronen herkennen ook korte meldingen over ontbrekende inhoud en eerste-persoonsuitspraken over samenvatten. Dit is een conservatieve tekstcontrole: ongebruikelijke formuleringen of toeschrijvingen kunnen buiten de herkenning vallen.
