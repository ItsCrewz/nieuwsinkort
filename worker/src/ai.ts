import { isDagQuota, meetChat, meetFout, type Meting } from "../../src/budget";
import { groq, mistral, keten, type LlmState, type Wacht } from "./llm";
// Workers AI: samenvattingen in eenvoudig Nederlands. Houdt neuronen bij (echte usage, anders geschat uit tokens); de Groq- en Mistral-terugval tellen tokens, geen neuronen.
export const RATES: Record<string, [number, number]> = { // neuronen per 1M tokens [in, uit]
  "@cf/google/gemma-4-26b-a4b-it": [9091, 27273],
  "@cf/meta/llama-3.2-1b-instruct": [2457, 18252],
  "@cf/meta/llama-3.2-3b-instruct": [4625, 30475],
  "@cf/qwen/qwen3-30b-a3b-fp8": [4625, 30475],
  "@cf/meta/llama-3.1-8b-instruct-fp8-fast": [4119, 34868],
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668, 204805],
  "@cf/mistralai/mistral-small-3.1-24b-instruct": [31876, 50488],
};
export type Usage = Meting & { aanbieders?: Record<string, { inTok: number; outTok: number }>; llm?: { sleutel?: string; mistralSleutel?: string; mistralMaandTokens?: string; mistralTussenpoos?: string; state: LlmState; groqEerst?: boolean; cloudflare?: boolean; cloudflareFout?: string; wacht?: Wacht } };

// Alleen een echte Cloudflare-dagquota-fout (zelfde regel als #79) telt als "Cloudflare op"; geen brede regex.
export const ketenQuota = (e: unknown) => e instanceof KetenFout && !!e.cloudflare && isDagQuota(e.cloudflare);
export class KetenFout extends Error {
  constructor(public cloudflare?: string) { super(`AI-keten uitgeput${cloudflare ? `; cloudflare: ${cloudflare}` : ""}`); }
}

const STIJL =
  "Je schrijft voor de Nederlandse nieuwssite 'Nieuws in het kort'. Schrijf voor volwassenen in eenvoudig Nederlands (B1): korte zinnen (liefst hooguit 15 woorden, nooit meer dan 20), gewone woorden; leg jargon en moeilijke woorden kort uit. Schrijf afkortingen bij eerste gebruik voluit. " +
  "Gebruik ALLEEN feiten uit de aangeleverde tekst; verzin niets, geen eigen mening. Is de bron Engels, schrijf dan toch in het Nederlands. Namen en getallen precies overnemen.";

export async function chat(ai: Ai, model: string, sys: string, user: string, maxTokens: number, u: Usage, json = false): Promise<string> {
  const tarief = RATES[model] || [10000, 30000];
  const v = { sys, user, maxTokens, json };
  const extern = async () => keten([groq(u.llm?.sleutel), mistral(u.llm?.mistralSleutel, u.llm?.mistralMaandTokens, u.llm?.mistralTussenpoos)].filter((a): a is NonNullable<typeof a> => !!a), u.llm?.state || {}, v, (naam, _model, antwoord) => {
    u.calls++; u.inTok += antwoord.inTok; u.outTok += antwoord.outTok;
    const t = (u.aanbieders ||= {})[naam] ||= { inTok: 0, outTok: 0 }; t.inTok += antwoord.inTok; t.outTok += antwoord.outTok;
  }, u.llm ? (u.llm.wacht ||= { totaal: 0 }) : undefined);
  const cf = async () => {
    if (!ai || u.llm?.cloudflare === false) throw new Error("Cloudflare niet beschikbaar");
    let r: any;
    const i0 = u.inTok, o0 = u.outTok;
    const tokensCf = (i: number, o: number) => { const t = (u.aanbieders ||= {}).cloudflare ||= { inTok: 0, outTok: 0 }; t.inTok += u.inTok - i; t.outTok += u.outTok - o; };
    try {
      r = await ai.run(model as any, {
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      max_tokens: maxTokens, max_completion_tokens: maxTokens, temperature: 0.3,
      chat_template_kwargs: { enable_thinking: false, thinking: false },
      ...(json ? { response_format: { type: "json_object" } } : {}),
    } as any);
    } catch (e) { meetFout(u, tarief, sys + user, maxTokens, e); tokensCf(i0, o0); throw e; } // een mislukte aanroep kan toch neuronen kosten
    u.calls++;
    meetChat(u, tarief, sys + user, String(r?.response ?? ""), r?.usage);
    tokensCf(i0, o0);
    const txt = typeof r?.response === "string" ? r.response : r?.response ? JSON.stringify(r.response) : r?.choices?.[0]?.message?.content || "";
    if (!txt) throw new Error("Leeg AI-antwoord");
    return String(txt);
  };
  let txt: string;
  let cloudflareFout = u.llm?.cloudflareFout;
  try {
    if (u.llm?.groqEerst && u.llm.sleutel || u.llm?.cloudflare === false) txt = await extern();
    else {
      try { txt = await cf(); } catch (e) {
        cloudflareFout = e instanceof Error ? e.message : String(e);
        if (u.llm && isDagQuota(cloudflareFout)) { u.llm.cloudflare = false; u.llm.cloudflareFout = cloudflareFout; }
        txt = await extern();
      }
    }
  } catch { throw new KetenFout(cloudflareFout); }
  return txt.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
function jsonFrom(s: string): any {
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  const a2 = s.indexOf("["), b2 = s.lastIndexOf("]");
  const tryP = (x: string) => { try { return JSON.parse(x); } catch { return undefined; } };
  return (a >= 0 && b > a && tryP(s.slice(a, b + 1))) ?? (a2 >= 0 && b2 > a2 ? tryP(s.slice(a2, b2 + 1)) : undefined);
}

export type In = { id: number; cat: string; bronnen: string[]; titels: string[]; tekst: string };
export type Sum = { kop: string; ai: string; samenvatting: string; punten: string[] };

export async function summarize(ai: Ai, model: string, items: In[], u: Usage): Promise<Map<number, Sum>> {
  const sys = STIJL + " Antwoord alleen met geldige JSON, zonder uitleg of markdown.";
  const user =
    `Vat elk bericht samen in nieuwsstijl. Geef per bericht:\n- "kop": nieuwskop, liefst 6 tot 10 woorden: wie of wat (waar) plus de kern of uitkomst. Bij citaat of discussie het citaat of de kern (wat over wie gezegd wordt), niet de sprekers. Fout: "A en B praten over burgemeester C". Goed: "Burgemeester C 'te laat met maatregelen'". Teams, clubs, programma's en plaatsen uit de bron blijven in de kop. Geen vraag, uitroepteken, lokkertje of "Artikel over"\n- "ai": 1 of 2 korte zinnen met de kern en de data, plaatsen, adressen en namen uit de tekst. Waarom het ertoe doet alleen als de bron dat zegt, anders een tweede concreet feit. Nooit "Dit is belangrijk", "Dit gaat over", "Het artikel gaat over"; geen URL's. Herhaal de kop niet. Zonder tekst: één korte zin die alleen de titel herformuleert, geen opvulzin (\"Mensen bespreken dit\")\n` +
    `- "samenvatting": 2 tot 3 korte zinnen met de belangrijkste feiten\n- "punten": hooguit 2 korte kernpunten (elk max 12 woorden), alleen feiten die nog niet in de samenvatting staan; anders een lege lijst\n` +
    `Alleen wat letterlijk in titel of tekst staat: geen interpretatie, gevolgen of oorzaken. Eigennamen foutloos overnemen. Vaktermen en afkortingen (garbage collection, WebAssembly) onvertaald; bij alleen een linkregel de titel, geen verzonnen kop. Liever tegenwoordige tijd en actieve vorm ("is", niet "wordt").\n` +
    `Antwoord als {"items":[{"id":1,"kop":"...","ai":"...","samenvatting":"...","punten":["..."]}]}\n\nBerichten:\n` +
    JSON.stringify(items.map((i) => ({ id: i.id, bron: i.bronnen.join(", "), titel: i.titels.join(" | "), tekst: i.tekst })));
  const out = new Map<number, Sum>();
  // kleine modellen: geen JSON-modus (niet overal ondersteund), wel JSON vragen en eruit vissen
  const small = /llama-3\.2-[13]b/.test(model);
  // Minder uitvoer per bericht, met vaste ruimte voor de JSON-structuur.
  const txt = await chat(ai, model, sys, user, (small ? 150 : 180) * items.length + 80, u, !small);
  const j = jsonFrom(txt);
  const arr = Array.isArray(j) ? j : j?.items;
  for (const x of Array.isArray(arr) ? arr : []) {
    const id = Number(x?.id);
    if (!items.some((i) => i.id === id)) continue;
    const s: Sum = { kop: str(x.kop, 90), ai: str(x.ai, 240), samenvatting: str(x.samenvatting, 900), punten: (Array.isArray(x.punten) ? x.punten : []).map((p: any) => str(p, 140)).filter(Boolean).slice(0, 2) };
    if (s.kop && s.ai) out.set(id, s);
  }
  if (!out.size) u.fails++;
  return out;
}
const str = (x: any, n: number) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function inHetKort(ai: Ai, model: string, lines: string[], u: Usage): Promise<string> {
  const sys = STIJL + " Geef alleen de tekst zelf, geen kopje, geen opsomming.";
  const user =
    "Schrijf 'In het kort': een helder overzicht van het nieuws van vandaag in 3 tot 4 korte zinnen (samen max 90 woorden), als één alinea. " +
    "Begin met het grootste nieuws. Noem kort ook iets uit Haarlem, tech en showbizz als dat erbij staat. Verzin niets.\n\nBerichten (rubriek: kop — samenvatting):\n" +
    lines.join("\n");
  const t = await chat(ai, model, sys, user, 260, u);
  return t.replace(/^["'\s]*(In het kort:?)?\s*/i, "").replace(/\s+/g, " ").trim();
}

// Prompt-echo (#378): het model herhaalt soms de instructie i.p.v. het bericht te schrijven; zo'n tekst nooit tonen of bewaren.
export function isPromptEcho(t: string): boolean {
  return /^\W*herschrijf\b/i.test(t) || /nieuws in het kort'|eenvoudig nederlands \(b1\)|geef alleen de tekst zelf|alleen feiten uit de aangeleverde tekst/i.test(t);
}

export async function simpelWeer(ai: Ai, model: string, knmi: string, u: Usage): Promise<string> {
  const sys = STIJL + " Geef alleen de tekst zelf.";
  const user = `Herschrijf dit weerbericht voor heel Nederland in 2 of 3 korte, simpele zinnen (max 60 woorden). Noem vanmiddag/vanavond/morgen en verschillen tussen noord, midden en zuid alleen als dat erin staat. Getallen precies overnemen.\n\n${knmi.slice(0, 1500)}`;
  const t = (await chat(ai, model, sys, user, 160, u)).replace(/\s+/g, " ").trim();
  return isPromptEcho(t) ? "" : t;
}

// "Lees verder": per bericht een langere uitleg (3–5 alinea's) en per bron de kernpunten, uit de artikeltekst zelf.
export type DiepIn = { id: number; kop: string; kort: string; bronnen: { site: string; tekst: string }[] };
export type Diep = { uitleg: string[]; perBron: { site: string; punten: string[] }[] };
export async function verdiep(ai: Ai, model: string, items: DiepIn[], u: Usage): Promise<Map<number, Diep>> {
  const sys = STIJL + " Antwoord alleen met geldige JSON, zonder uitleg of markdown.";
  const user =
    `Schrijf voor elk bericht een eenvoudige langere uitleg voor wie meer wil weten dan de korte samenvatting ("kort").\n` +
    `- "uitleg": 3 tot 5 korte alinea's (samen 120 tot 220 woorden): wat er precies gebeurde, de achtergrond, wie erbij betrokken zijn, wat het betekent en wat er nu gaat gebeuren. Herhaal "kort" niet letterlijk. Alleen wat in de bronteksten staat.\n` +
    `- "perBron": per bron 2 tot 4 korte kernpunten (elk max 15 woorden) met wat díe bron meldt; "site" precies zoals aangeleverd.\n` +
    `Antwoord als {"items":[{"id":1,"uitleg":["alinea","..."],"perBron":[{"site":"...","punten":["..."]}]}]}\n\nBerichten:\n` +
    JSON.stringify(items);
  const out = new Map<number, Diep>();
  const txt = await chat(ai, model, sys, user, 750 * items.length + 100, u, true);
  const j = jsonFrom(txt);
  const arr = Array.isArray(j) ? j : j?.items;
  for (const x of Array.isArray(arr) ? arr : []) {
    const id = Number(x?.id);
    const src = items.find((i) => i.id === id);
    if (!src) continue;
    const uitleg = (Array.isArray(x.uitleg) ? x.uitleg : String(x.uitleg || "").split(/\n\s*\n/)).map((p: any) => str(p, 900)).filter((p: string) => p.length > 20).slice(0, 6);
    const perBron = (Array.isArray(x.perBron) ? x.perBron : [])
      .map((b: any) => ({ site: str(b?.site, 60), punten: (Array.isArray(b?.punten) ? b.punten : []).map((p: any) => str(p, 160)).filter(Boolean).slice(0, 4) }))
      .filter((b: any) => b.punten.length && src.bronnen.some((s) => s.site === b.site));
    if (uitleg.join(" ").length >= 250) out.set(id, { uitleg, perBron });
  }
  if (!out.size) u.fails++;
  return out;
}
