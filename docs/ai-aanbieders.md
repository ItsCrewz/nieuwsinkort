# AI-aanbieders en secrets

De uur-Worker probeert voor tekst eerst Workers AI en daarna de Groq-modellen `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` en `openai/gpt-oss-20b`. Bij een fout of een bereikte limiet volgt het volgende model. Zonder beschikbare aanbieder blijft de bestaande fallback zonder AI actief. Voor Lees verder heeft Groq voorrang; zonder sleutel gebruikt de Worker Workers AI onder 65% van het neuronbudget.

Groq gebruikt per model een UTC-dagteller en een voortschrijdend minuutvenster. De Worker reserveert vooraf een schatting van invoer en maximale uitvoer; ook mislukte verzoeken tellen mee. Verzoeken die niet binnen de limieten passen worden overgeslagen. De state wordt bij de normale run opgeslagen in KV. Neuronen betreffen alleen Workers AI; de runmetadata vermeldt tokens per aanbieder.

Joey kan het optionele secret later zelf instellen met `wrangler secret put GROQ_API_KEY` voor de uur-Worker. Zonder `GROQ_API_KEY` slaat de Worker Groq stil over. Plaats geen secretwaarde in bestanden of logs.

Bij een Cloudflare-quotafout gaat de rest van de run direct naar Groq. Zijn alle modellen alleen door het minuutvenster geblokkeerd, dan wacht de keten eenmaal maximaal 20 seconden; per run is de totale wachttijd maximaal drie minuten. Bij uitputting blijft de Cloudflare-foutmelding behouden.
