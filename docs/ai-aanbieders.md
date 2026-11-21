# AI-aanbieders en secrets

De uur-Worker probeert voor tekst eerst Workers AI en daarna de Groq-modellen `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` en `openai/gpt-oss-20b`. Daarna volgt Mistral als extra reserve. Bij een fout of een bereikte limiet volgt het volgende model. Zonder beschikbare aanbieder blijft de bestaande fallback zonder AI actief. Voor Lees verder heeft Groq voorrang; zonder sleutel gebruikt de Worker Workers AI onder 65% van het neuronbudget.

Voor JSON-verzoeken krijgen de twee Groq gpt-oss-modellen `reasoning_effort: low` en tweemaal de gevraagde uitvoerlimiet als `max_completion_tokens`, zodat redenering ruimte laat voor JSON. De reservering houdt rekening met deze hogere limiet. Dit is een hypothese voor de gemelde HTTP 400; het effect is zonder live verzoek niet bevestigd.

Groq gebruikt per model een UTC-dagteller en een voortschrijdend minuutvenster. De Worker reserveert vooraf een schatting van invoer en maximale uitvoer; ook mislukte verzoeken tellen mee. Verzoeken die niet binnen de limieten passen worden overgeslagen. De state wordt bij de normale run opgeslagen in KV. Neuronen betreffen alleen Workers AI; de runmetadata vermeldt tokens per aanbieder.

Bij een mislukte Groq- of Mistral-call logt de Worker naast aanbieder, model en HTTP-status ook eventuele `error.code` en `error.type` uit de JSON-body. Alleen korte identificaties met letters, cijfers, punt, streepje of underscore worden meegenomen; ontbrekende of ongeldige waarden worden weggelaten. Berichttekst, headers en de gebruikte sleutel worden niet gelogd. De terugval blijft ongewijzigd.

Joey kan het optionele secret later zelf instellen met `wrangler secret put GROQ_API_KEY` voor de uur-Worker. Zonder `GROQ_API_KEY` slaat de Worker Groq stil over. Plaats geen secretwaarde in bestanden of logs.

Bij een Cloudflare-quotafout gaat de rest van de run direct naar Groq. Zijn alle modellen alleen door het minuutvenster geblokkeerd, dan wacht de keten eenmaal maximaal 20 seconden; per run is de totale wachttijd maximaal drie minuten. Bij uitputting blijft de Cloudflare-foutmelding behouden.

## Mistral

Voorwaarde vóór het instellen van `MISTRAL_API_KEY`: zet training uit via Admin › Privacy › “Anonymous improvement data” uit.

Mistral (free tier) begrenst ook per seconde. De keten houdt daarom per aanbieder een minimale tussenpoos tussen verzoeken aan, over alle modellen van die aanbieder; voor Mistral standaard 1100 ms, instelbaar met de optionele var `MISTRAL_TUSSENPOOS_MS` (geheel getal ≥ 0, `0` schakelt uit). Het slot wordt vooraf in het minuutvenster gereserveerd, zodat ook gelijktijdige aanroepen op elkaar wachten. Groq heeft geen tussenpoos.

Bij HTTP 429 probeert de keten hetzelfde model eenmaal opnieuw na `Retry-After` (seconden of HTTP-datum), minstens na de tussenpoos. Is `Retry-After` langer dan 5 seconden, dan volgt geen retry maar het volgende model. Zonder header volgt alleen een retry na de tussenpoos bij een aanbieder die er een heeft. De retry telt als extra verzoek in de limieten en de wachttijd telt mee in de totale wachttijd per run. Beide aanpassingen spreiden alleen verzoeken binnen de gratis limieten en brengen geen kosten mee. Tests: `tests/tussenpoos.test.ts` (fake klok).

## Fallbackketen en foutcodes (#874)

Volgorde per tekstverzoek: hoofdmodel → klein model → externe aanbieder (Groq, dan Mistral; alleen met aanwezige sleutel) → extractief (feedtekst met `ruw: true`). De keuze tussen hoofd- en klein model hoort bij de neurontiers in `worker/src/index.ts`; `chat()` in `worker/src/ai.ts` probeert Workers AI en valt terug op de externe keten (`keten()` in `worker/src/llm.ts`). Zonder sleutel is de keten leeg en volgt direct de extractieve route. Alle LLM-paden (`tabsam.ts`, `filmgroep.ts`, de JSON-stappen in `ai.ts`) gebruiken `chat()`; `functions/samenvatting.ts` heeft een eigen Cloudflare-aanroep en gebruikt voor Groq `keten()`. Whisper (audio) valt buiten de keten. `tests/llm-fallback.test.ts` bewaakt met een zoekopdracht dat er geen directe aanroepen bijkomen.

Foutcodes (`worker/src/llmfout.ts`), gelogd als `LLM-fout <code> <bron> <model> <duur>ms`; nooit prompts, antwoorden, headers of sleutels:

| Code | Betekenis |
| --- | --- |
| `LLM_TIMEOUT` | Verzoek afgebroken door time-out (standaard 15 s, `Verzoek.timeoutMs` kan dit overschrijven) |
| `LLM_HTTP_5XX` | Aanbieder antwoordt met HTTP 5xx |
| `LLM_RATE_LIMIT` | HTTP 429 of melding over rate limit |
| `LLM_PARSE` | Leeg antwoord, kapotte JSON of geen bruikbare items |
| `LLM_BUDGET` | Dagquota (Cloudflare) of eigen limieten laten geen verzoek toe; de keten roept niets aan |
| `LLM_OVERIG` | Overige 4xx en onbekende fouten, zodat geen fout zonder code blijft |

De bestaande logregel `AI-aanbieder mislukt …` blijft ongewijzigd; de nieuwe regel komt ernaast. Budget, neuronen, `BUDGET` en `CAP` zijn niet aangepast.
