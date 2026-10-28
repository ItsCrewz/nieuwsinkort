// Workers AI: samenvattingen in simpele, informele taal. Houdt neuronen bij (geschat uit tokens).
export const RATES: Record<string, [number, number]> = { // neuronen per 1M tokens [in, uit]
  "@cf/google/gemma-4-26b-a4b-it": [9091, 27273],
  "@cf/qwen/qwen3-30b-a3b-fp8": [4625, 30475],
  "@cf/meta/llama-3.1-8b-instruct-fp8-fast": [4119, 34868],
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668, 204805],
  "@cf/mistralai/mistral-small-3.1-24b-instruct": [31876, 50488],
};
export type Usage = { neurons: number; calls: number; fails: number; inTok: number; outTok: number };

const STIJL =
  "Je schrijft voor de Nederlandse nieuwssite 'Nieuws in het kort'. Schrijf in heel simpel, informeel Nederlands (Jip-en-Janneke-taal): korte zinnen, gewone woorden, geen jargon. " +
  "Gebruik ALLEEN feiten uit de aangeleverde tekst; verzin niets, geen eigen mening. Is de bron Engels, schrijf dan toch in het Nederlands. Namen en getallen precies overnemen.";

export async function chat(ai: Ai, model: string, sys: string, user: string, maxTokens: number, u: Usage, json = false): Promise<string> {
  const r: any = await ai.run(model as any, {
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    max_tokens: maxTokens, max_completion_tokens: maxTokens, temperature: 0.3,
    chat_template_kwargs: { enable_thinking: false, thinking: false },
    ...(json ? { response_format: { type: "json_object" } } : {}),
  } as any);
  u.calls++;
  const pt = r?.usage?.prompt_tokens ?? Math.ceil((sys.length + user.length) / 3.5);
  const ct = r?.usage?.completion_tokens ?? Math.ceil(String(r?.response ?? "").length / 3.5);
  const [ri, ro] = RATES[model] || [10000, 30000];
  u.inTok += pt; u.outTok += ct;
  u.neurons += typeof r?.usage?.neurons === "number" ? r.usage.neurons : (pt * ri + ct * ro) / 1e6;
  const txt = typeof r?.response === "string" ? r.response : r?.response ? JSON.stringify(r.response) : r?.choices?.[0]?.message?.content || "";
  return String(txt).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
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
    `Vat elk bericht samen. Geef per bericht:\n- "kop": korte Nederlandse kop, max 8 woorden\n- "ai": één simpele zin (max 25 woorden) wat er gebeurde\n` +
    `- "samenvatting": 2 tot 4 korte zinnen met de belangrijkste feiten\n- "punten": 2 of 3 korte kernpunten (elk max 12 woorden)\n` +
    `Antwoord als {"items":[{"id":1,"kop":"...","ai":"...","samenvatting":"...","punten":["..."]}]}\n\nBerichten:\n` +
    JSON.stringify(items.map((i) => ({ id: i.id, bron: i.bronnen.join(", "), titel: i.titels.join(" | "), tekst: i.tekst })));
  const out = new Map<number, Sum>();
  const txt = await chat(ai, model, sys, user, 260 * items.length + 100, u, true);
  const j = jsonFrom(txt);
  const arr = Array.isArray(j) ? j : j?.items;
  for (const x of Array.isArray(arr) ? arr : []) {
    const id = Number(x?.id);
    if (!items.some((i) => i.id === id)) continue;
    const s: Sum = { kop: str(x.kop, 90), ai: str(x.ai, 240), samenvatting: str(x.samenvatting, 900), punten: (Array.isArray(x.punten) ? x.punten : []).map((p: any) => str(p, 140)).filter(Boolean).slice(0, 4) };
    if (s.kop && s.ai) out.set(id, s);
  }
  if (!out.size) u.fails++;
  return out;
}
const str = (x: any, n: number) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function inHetKort(ai: Ai, model: string, lines: string[], u: Usage): Promise<string> {
  const sys = STIJL + " Geef alleen de tekst zelf, geen kopje, geen opsomming.";
  const user =
    "Schrijf 'In het kort': een overzicht van het nieuws van vandaag in 3 tot 4 korte zinnen (samen max 90 woorden), als één alinea. " +
    "Begin met het grootste nieuws. Noem kort ook iets uit Haarlem, tech en showbizz als dat erbij staat. Verzin niets.\n\nBerichten (rubriek: kop — samenvatting):\n" +
    lines.join("\n");
  const t = await chat(ai, model, sys, user, 260, u);
  return t.replace(/^["'\s]*(In het kort:?)?\s*/i, "").replace(/\s+/g, " ").trim();
}

export async function simpelWeer(ai: Ai, model: string, knmi: string, u: Usage): Promise<string> {
  const sys = STIJL + " Geef alleen de tekst zelf.";
  const user = `Herschrijf dit weerbericht voor Haarlem in 2 of 3 korte, simpele zinnen (max 60 woorden). Noem vanmiddag/vanavond/morgen als dat erin staat. Getallen precies overnemen.\n\n${knmi.slice(0, 1500)}`;
  return (await chat(ai, model, sys, user, 160, u)).replace(/\s+/g, " ").trim();
}
