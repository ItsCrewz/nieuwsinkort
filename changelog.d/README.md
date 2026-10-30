# changelog.d

Elke PR schrijft hier één fragment `<issue>-<slug>.md` (bijv. `98-changelog-fragmenten.md`) in plaats van `CHANGELOG.md` te bewerken; zo conflicteren PR's niet meer op dezelfde regels. Inhoud: één of meer opsommingspunten, bijvoorbeeld:

```
- Korte beschrijving van de wijziging (#98).
```

De coördinator voegt de fragmenten vóór een release samen met `npm run changelog` (voegt toe onder "Onuitgebracht" in `CHANGELOG.md` en verwijdert de fragmenten; `-- --dry` toont alleen). Dit bestand blijft staan.
