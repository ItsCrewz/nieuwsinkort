# Pipeline-scripts (Dagelijks Nieuws)

Deze scripts stonden oorspronkelijk in `/workspace/nieuws` op de box en werden gedraaid door de
Grok Bot-routine "Dagelijks Nieuws". Hier staan ze als kopie, ongewijzigd.

| Bestand | Wat het doet |
| --- | --- |
| `filmpjes.py` | Kandidaten voor de tabbladen "Filmpjes" (nieuwsfilmpjes) en "Dumpert"; geeft JSON met `filmpjes`, `dumpert` en `status`. Opties: `--dumpert`, `--filmpjes`, `--uren N`. |
| `weer.py` | Haalt het weer voor Haarlem op (oude pipeline; het live weer is sinds #37 landelijk en komt uit `worker/src/weer.ts`) (Buienradar, KNMI, Open-Meteo als terugval) en print het WEER-object als JSON. `--raw` voegt de volledige KNMI-tekst toe. |
| `yt_transcript.py` | `yt_transcript.py <video_id> [...]`: schone NL-transcriptie van een YouTube-video via Invidious (met terugvalopties). |
| `gemeenteraad_ori.py` | Recente gemeenteraad-/collegevergaderingen via Open Raadsinformatie (Elastic). Opties: `--gemeente`, `--max`, `--type`. |
| `officiele_bekendmakingen.py` | Recente officiële bekendmakingen via repository.overheid.nl (SRU), standaard gefilterd op nieuwswaardige types. Opties: `--gemeente`, `--max`, `--all`. |
| `feeds.json` | Lijst van bronnen/feeds. |
| `feeds_detail.json` | Extra detailgegevens per feed; bevat geen Reddit-feeds. |

## Koppeling met de rest van de repo

- `scripts/build-bronnen.mjs` leest `feeds.json` via de omgevingsvariabele `FEEDS_JSON`
  (standaard `/workspace/nieuws/feeds.json`) en `filmpjes.py` via `FILMPJES_PY`
  (standaard `/workspace/nieuws/filmpjes.py`). Wil je deze kopie gebruiken, zet dan
  `FEEDS_JSON=scripts/pipeline/feeds.json` en `FILMPJES_PY=scripts/pipeline/filmpjes.py`.
- Vastgelegde `/workspace`-paden in de scripts zijn bewust niet aangepast.
