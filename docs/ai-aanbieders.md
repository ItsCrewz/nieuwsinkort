# AI-aanbieders en secrets

De uur-Worker probeert voor tekst eerst Workers AI en daarna de Groq-modellen `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` en `openai/gpt-oss-20b`. Daarna volgt Mistral als extra reserve. Bij een fout of een bereikte limiet volgt het volgende model. Zonder beschikbare aanbieder blijft de bestaande fallback zonder AI actief. Voor Lees verder heeft Groq voorrang; zonder sleutel gebruikt de Worker Workers AI onder 65% van het neuronbudget.

Voor JSON-verzoeken krijgen de twee Groq gpt-oss-modellen `reasoning_effort: low` en tweemaal de gevraagde uitvoerlimiet als `max_completion_tokens`, zodat redenering ruimte laat voor JSON. De reservering houdt rekening met deze hogere limiet. Dit is een hypothese voor de gemelde HTTP 400; het effect is zonder live verzoek niet bevestigd.

Groq gebruikt per model een UTC-dagteller en een voortschrijdend minuutvenster. De Worker reserveert vooraf een schatting van invoer en maximale uitvoer; ook mislukte verzoeken tellen mee. Verzoeken die niet binnen de limieten passen worden overgeslagen. De state wordt bij de normale run opgeslagen in KV. Neuronen betreffen alleen Workers AI; de runmetadata vermeldt tokens per aanbieder.

Bij een mislukte Groq- of Mistral-call logt de Worker naast aanbieder, model en HTTP-status ook eventuele `error.code` en `error.type` uit de JSON-body. Alleen korte identificaties met letters, cijfers, punt, streepje of underscore worden meegenomen; ontbrekende of ongeldige waarden worden weggelaten. Berichttekst, headers en de gebruikte sleutel worden niet gelogd. De terugval blijft ongewijzigd.

Joey kan het optionele secret later zelf instellen met `wrangler secret put GROQ_API_KEY` voor de uur-Worker. Zonder `GROQ_API_KEY` slaat de Worker Groq stil over. Plaats geen secretwaarde in bestanden of logs.

Bij een Cloudflare-quotafout gaat de rest van de run direct naar Groq. Zijn alle modellen alleen door het minuutvenster geblokkeerd, dan wacht de keten eenmaal maximaal 20 seconden; per run is de totale wachttijd maximaal drie minuten. Bij uitputting blijft de Cloudflare-foutmelding behouden.

## Mistral

Voorwaarde vóór het instellen van `MISTRAL_API_KEY`: zet training uit via Admin › Privacy › “Anonymous improvement data” uit.
