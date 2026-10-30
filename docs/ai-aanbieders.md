# AI-aanbieders en secrets

De uur-Worker probeert voor tekst eerst Workers AI en daarna de Groq-modellen `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` en `openai/gpt-oss-20b`. Daarna volgt Mistral als extra reserve. Bij een fout of een bereikte limiet volgt het volgende model. Zonder beschikbare aanbieder blijft de bestaande fallback zonder AI actief. Voor Lees verder heeft Groq voorrang; zonder sleutel gebruikt de Worker Workers AI onder 65% van het neuronbudget.

Groq gebruikt per model een UTC-dagteller en een voortschrijdend minuutvenster. De Worker reserveert vooraf een schatting van invoer en maximale uitvoer; ook mislukte verzoeken tellen mee. Verzoeken die niet binnen de limieten passen worden overgeslagen. De state wordt bij de normale run opgeslagen in KV. Neuronen betreffen alleen Workers AI; de runmetadata vermeldt tokens per aanbieder.

Joey kan het optionele secret later zelf instellen met `wrangler secret put GROQ_API_KEY` voor de uur-Worker. Zonder `GROQ_API_KEY` slaat de Worker Groq stil over. Plaats geen secretwaarde in bestanden of logs.

Bij een Cloudflare-quotafout gaat de rest van de run direct naar Groq. Zijn alle modellen alleen door het minuutvenster geblokkeerd, dan wacht de keten eenmaal maximaal 20 seconden; per run is de totale wachttijd maximaal drie minuten. Bij uitputting blijft de Cloudflare-foutmelding behouden.

## Mistral

Voorwaarde vóór het instellen van `MISTRAL_API_KEY`: zet training uit via Admin › Privacy › “Anonymous improvement data” uit.

Mistral (free tier) begrenst ook per seconde. De keten houdt daarom per aanbieder een minimale tussenpoos tussen verzoeken aan, over alle modellen van die aanbieder; voor Mistral standaard 1100 ms, instelbaar met de optionele var `MISTRAL_TUSSENPOOS_MS` (geheel getal ≥ 0, `0` schakelt uit). Het slot wordt vooraf in het minuutvenster gereserveerd, zodat ook gelijktijdige aanroepen op elkaar wachten. Groq heeft geen tussenpoos.

Bij HTTP 429 probeert de keten hetzelfde model eenmaal opnieuw na `Retry-After` (seconden of HTTP-datum), minstens na de tussenpoos. Is `Retry-After` langer dan 5 seconden, dan volgt geen retry maar het volgende model. Zonder header volgt alleen een retry na de tussenpoos bij een aanbieder die er een heeft. De retry telt als extra verzoek in de limieten en de wachttijd telt mee in de totale wachttijd per run. Beide aanpassingen spreiden alleen verzoeken binnen de gratis limieten en brengen geen kosten mee. Tests: `tests/tussenpoos.test.ts` (fake klok).
