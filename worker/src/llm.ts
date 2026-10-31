// Generieke, opeenvolgende keten met conservatieve reserveringen per model.
export type Teller = { dag: string; calls: number; tokens: number; venster: { tijd: number; tokens: number }[]; maand?: string; maandTokens?: number };
export type LlmState = Record<string, Teller>;
export type Verzoek = { sys: string; user: string; maxTokens: number; json: boolean };
export type Antwoord = { tekst: string; inTok: number; outTok: number };
// tussenpoos: minimale ms tussen twee verzoeken naar dezelfde aanbieder (over alle modellen).
export type Aanbieder = { naam: string; modellen: string[]; limieten: { rpm: number; rpd: number; tpm: number; tpd: number; maandTokens?: number; tussenpoos?: number }; call: (model: string, verzoek: Verzoek) => Promise<Antwoord> };
export const MISTRAL_TUSSENPOOS = 1100, MAX_RETRY_AFTER = 5000;

// Retry-After in ms (seconden of HTTP-datum); undefined als hij ontbreekt of onleesbaar is.
export function retryAfterMs(waarde: string | null | undefined, nu: number): number | undefined {
  const s = waarde?.trim();
  if (!s) return undefined;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.ceil(Number(s) * 1000);
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : Math.max(0, t - nu);
}

class HttpFout extends Error {
  constructor(status: number, readonly details: { code?: string; type?: string }, readonly retryAfter: string | null = null) { super(`AI-aanbieder HTTP ${status}`); }
}

async function httpFout(r: Response, sleutel: string): Promise<HttpFout> {
  const details: { code?: string; type?: string } = {};
  try {
    const data: any = await r.json();
    for (const veld of ["code", "type"] as const) {
      const waarde = data?.error?.[veld];
      if (typeof waarde === "string" && /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(waarde) && !waarde.includes(sleutel)) details[veld] = waarde;
    }
  } catch { /* Ongeldige of ontbrekende body: alleen de status loggen. */ }
  return new HttpFout(r.status, details, r.headers?.get("retry-after") ?? null);
}

function groqJson(model: string, v: Verzoek): boolean { return v.json && (model === "openai/gpt-oss-120b" || model === "openai/gpt-oss-20b"); }

export function groq(sleutel?: string): Aanbieder | undefined {
  if (!sleutel) return undefined;
  return { naam: "groq", modellen: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"], limieten: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
    async call(model, v) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sleutel}`, "User-Agent": "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)" }, body: JSON.stringify({ model, messages: [{ role: "system", content: v.sys }, { role: "user", content: v.user }], ...(groqJson(model, v) ? { max_completion_tokens: v.maxTokens * 2, reasoning_effort: "low" } : { max_tokens: v.maxTokens }), temperature: 0.3, ...(v.json ? { response_format: { type: "json_object" } } : {}) }), signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw await httpFout(r, sleutel);
      const data: any = await r.json();
      const tekst = data?.choices?.[0]?.message?.content;
      if (typeof tekst !== "string" || !tekst.trim()) throw new Error("Leeg AI-antwoord");
      return { tekst, inTok: data?.usage?.prompt_tokens ?? Math.ceil((v.sys.length + v.user.length) / 3.5), outTok: data?.usage?.completion_tokens ?? Math.ceil(tekst.length / 3.5) };
    } };
}

export function mistral(sleutel?: string, maandTokens?: string, tussenpoos?: string): Aanbieder | undefined {
  if (!sleutel) return undefined;
  const max = Number(maandTokens), poos = Number(tussenpoos);
  return { naam: "mistral", modellen: ["mistral-small-latest"], limieten: { rpm: 60, rpd: 2000, tpm: 100000, tpd: 1000000, maandTokens: maandTokens && Number.isSafeInteger(max) && max >= 0 ? max : 30000000, tussenpoos: tussenpoos && Number.isSafeInteger(poos) && poos >= 0 ? poos : MISTRAL_TUSSENPOOS },
    async call(model, v) {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sleutel}`, "User-Agent": "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)" }, body: JSON.stringify({ model, messages: [{ role: "system", content: v.sys }, { role: "user", content: v.user }], max_tokens: v.maxTokens, temperature: 0.3, ...(v.json ? { response_format: { type: "json_object" } } : {}) }), signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw await httpFout(r, sleutel);
      const data: any = await r.json();
      const tekst = data?.choices?.[0]?.message?.content;
      if (typeof tekst !== "string" || !tekst.trim()) throw new Error("Leeg AI-antwoord");
      return { tekst, inTok: data?.usage?.prompt_tokens ?? Math.ceil((v.sys.length + v.user.length) / 3.5), outTok: data?.usage?.completion_tokens ?? Math.ceil(tekst.length / 3.5) };
    } };
}

// Geschatte tokens voor één verzoek (invoer + gereserveerde uitvoer); keten en ruimteVoor gebruiken dezelfde schatting.
const schatVerzoek = (a: Aanbieder, model: string, v: Verzoek) => Math.ceil((v.sys.length + v.user.length) / 3.5) + (a.naam === "groq" && groqJson(model, v) ? v.maxTokens * 2 : v.maxTokens);

// Past er nog een verzoek binnen de dag-, maand- en minuutlimieten van minstens één model? Zonder iets te reserveren of te wachten (voor de ene terugval, #431).
export function ruimteVoor(aanbieders: Aanbieder[], state: LlmState, v: Verzoek, nu = Date.now()): boolean {
  const dag = new Date(nu).toISOString().slice(0, 10);
  return aanbieders.some((a) => a.modellen.some((model) => {
    const s = schatVerzoek(a, model, v), t = state[`${a.naam}:${model}`], vandaag = !!t && t.dag === dag;
    const maand = t?.maand === dag.slice(0, 7) ? t.maandTokens || 0 : 0;
    return s <= a.limieten.tpm && (!vandaag || (t.calls < a.limieten.rpd && t.tokens + s <= a.limieten.tpd)) && (a.limieten.maandTokens === undefined || maand + s <= a.limieten.maandTokens);
  }));
}

// ---- dagstanden samenvoegen (#431): Worker (`state.llm`) en Pages Function (`groq-chat:<dag>`) houden elk een stand bij.
// Een keten krijgt de som als beginstand, daarna wordt alleen het verschil bij een verse stand opgeteld; zo verliest geen van beide de ander.
export const kopieStand = (s: LlmState): LlmState => JSON.parse(JSON.stringify(s || {}));
/** Beginstand voor een keten: `eigen` plus wat `ander` vandaag al gebruikte (alleen aanbieder-sleutels met `voorvoegsel`). */
export function somStand(eigen: LlmState, ander: LlmState | null | undefined, dag: string, voorvoegsel = "groq:"): LlmState {
  const uit = kopieStand(eigen);
  for (const [k, o] of Object.entries(ander || {})) {
    if (!k.startsWith(voorvoegsel) || !o || o.dag !== dag) continue;
    const t = uit[k] && uit[k].dag === dag ? uit[k] : (uit[k] = { dag, calls: 0, tokens: 0, venster: [] });
    t.calls += +o.calls || 0; t.tokens += +o.tokens || 0; t.venster = [...t.venster, ...(o.venster || [])];
  }
  return uit;
}
/** Wat een keten aan de stand toevoegde (na - voor); een nieuwe dag begint opnieuw. */
export function verschilStand(voor: LlmState, na: LlmState): LlmState {
  const d: LlmState = {};
  for (const [k, n] of Object.entries(na)) {
    const v = voor[k], zelfde = v && v.dag === n.dag;
    const laatste = zelfde ? Math.max(-Infinity, ...v.venster.map((x) => x.tijd)) : -Infinity;
    d[k] = { dag: n.dag, calls: Math.max(0, n.calls - (zelfde ? v.calls : 0)), tokens: Math.max(0, n.tokens - (zelfde ? v.tokens : 0)), venster: n.venster.filter((x) => x.tijd > laatste),
      ...(n.maand ? { maand: n.maand, maandTokens: Math.max(0, (n.maandTokens || 0) - (zelfde && v.maand === n.maand ? v.maandTokens || 0 : 0)) } : {}) };
  }
  return d;
}
/** Telt een verschil op bij een verse stand (muteert `basis`); een andere dag in `basis` wordt vervangen. */
export function telOp(basis: LlmState, verschil: LlmState): LlmState {
  for (const [k, d] of Object.entries(verschil)) {
    if (!d.calls && !d.tokens && !d.maandTokens) continue;
    let t = basis[k];
    if (!t || t.dag !== d.dag) t = basis[k] = { dag: d.dag, calls: 0, tokens: 0, venster: [], ...(t?.maand && t.maand === d.maand ? { maand: t.maand, maandTokens: t.maandTokens } : {}) };
    t.calls += d.calls; t.tokens += d.tokens; t.venster = [...t.venster, ...d.venster].filter((x) => x.tijd > Date.now() - 60000);
    if (d.maand) { if (t.maand !== d.maand) { t.maand = d.maand; t.maandTokens = 0; } t.maandTokens = (t.maandTokens || 0) + (d.maandTokens || 0); }
  }
  return basis;
}
/** Schrijft het verbruik van een run bij in de bestaande `state` (voor als de run halverwege faalt of `state` niet weggeschreven werd); fouten worden gelogd, niet gegooid. */
export async function bewaarLlmVerschil(kv: { get(k: string, t: "json"): Promise<any>; put(k: string, v: string): Promise<unknown> }, voor: LlmState, na: LlmState): Promise<boolean> {
  try {
    const vers = await kv.get("state", "json");
    if (!vers) return false;
    telOp(vers.llm ||= {}, verschilStand(voor, na));
    await kv.put("state", JSON.stringify(vers));
    return true;
  } catch (x) { console.error("KV-schrijffout state (llm)", x); return false; }
}
/** Groq-tokens van één dag, opgeteld over alle modellen en alle gegeven standen. */
export const groqTokens = (dag: string, ...standen: (LlmState | null | undefined)[]) =>
  standen.reduce((n, s) => n + Object.entries(s || {}).reduce((m, [k, t]) => m + (k.startsWith("groq:") && t?.dag === dag ? +t.tokens || 0 : 0), 0), 0);

export type Wacht = { totaal: number; nu?: () => number; slaap?: (ms: number) => Promise<void> };

export async function keten(aanbieders: Aanbieder[], state: LlmState, v: Verzoek, gebruik: (naam: string, model: string, antwoord: Antwoord) => void, wacht: Wacht = { totaal: 0 }, bijFout?: (naam: string, e: unknown) => void): Promise<string> {
  const klok = wacht.nu || Date.now;
  const slaap = async (ms: number) => { if (ms <= 0) return; wacht.totaal += ms; await (wacht.slaap || ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(ms); };
  // Eerstvolgende vrije tijd voor de aanbieder; het venster bevat ook nog lopende reserveringen.
  const slot = (a: Aanbieder, vanaf: number) => {
    let laatste = -Infinity;
    for (const [k, t] of Object.entries(state)) if (k.startsWith(`${a.naam}:`)) for (const x of t.venster) laatste = Math.max(laatste, x.tijd);
    return Math.max(vanaf, laatste + (a.limieten.tussenpoos || 0));
  };
  for (let poging = 0; poging < 2; poging++) {
  let alleenVenster = true, modellen = 0, eerste = Infinity;
  for (const a of aanbieders) for (const model of a.modellen) {
    modellen++;
    const schatting = schatVerzoek(a, model, v);
    const nu = klok(), dag = new Date(nu).toISOString().slice(0, 10), sleutel = `${a.naam}:${model}`;
    let t = state[sleutel];
    const maand = dag.slice(0, 7);
    if (!t || t.dag !== dag) t = state[sleutel] = { dag, calls: 0, tokens: 0, venster: [], ...(t?.maand === maand ? { maand, maandTokens: t.maandTokens } : {}) };
    if (a.limieten.maandTokens !== undefined && t.maand !== maand) { t.maand = maand; t.maandTokens = 0; }
    t.venster = t.venster.filter((x) => x.tijd > nu - 60000);
    if ((a.limieten.maandTokens !== undefined && (t.maandTokens || 0) + schatting > a.limieten.maandTokens) || t.calls >= a.limieten.rpd || t.tokens + schatting > a.limieten.tpd || schatting > a.limieten.tpm) { alleenVenster = false; continue; }
    if (t.venster.length >= a.limieten.rpm || t.venster.reduce((n, x) => n + x.tokens, 0) + schatting > a.limieten.tpm) {
      const venster = [...t.venster].sort((x, y) => x.tijd - y.tijd);
      while (venster.length && (venster.length >= a.limieten.rpm || venster.reduce((n, x) => n + x.tokens, 0) + schatting > a.limieten.tpm)) {
        const vervalt = venster.shift()!.tijd + 60000 - nu;
        if (venster.length < a.limieten.rpm && venster.reduce((n, x) => n + x.tokens, 0) + schatting <= a.limieten.tpm) eerste = Math.min(eerste, vervalt);
      }
      continue;
    }
    alleenVenster = false;
    for (let herhaal = 0, vanaf = nu; ; herhaal++) {
      // Slot synchroon reserveren, zodat ook gelijktijdige aanroepen de tussenpoos aanhouden.
      const tijd = slot(a, vanaf);
      // Ook mislukte verzoeken kunnen bij de aanbieder meetellen.
      t.calls++; t.tokens += schatting; if (a.limieten.maandTokens !== undefined) t.maandTokens = (t.maandTokens || 0) + schatting; t.venster.push({ tijd, tokens: schatting });
      await slaap(tijd - klok());
      try { const antwoord = await a.call(model, v); gebruik(a.naam, model, antwoord); return antwoord.tekst; } catch (e) {
        const melding = e instanceof Error ? e.message : "";
        bijFout?.(a.naam, e);
        const http = /^AI-aanbieder HTTP (\d{3})$/.exec(melding);
        const details = e instanceof HttpFout && Object.keys(e.details).length ? [e.details] : [];
        console.error("AI-aanbieder mislukt", a.naam, model, http ? `HTTP ${http[1]}` : melding === "Leeg AI-antwoord" ? melding : "overige fout", ...details);
        if (herhaal || http?.[1] !== "429") break;
        // Eenmaal opnieuw na Retry-After (max 5 s); zonder header alleen bij een aanbieder met tussenpoos.
        const ms = retryAfterMs((e as HttpFout).retryAfter, klok()) ?? (a.limieten.tussenpoos || undefined);
        if (ms === undefined || ms > MAX_RETRY_AFTER) break;
        vanaf = klok() + ms;
      }
    }
  }
  if (poging || !modellen || !alleenVenster || eerste > 20000 || wacht.totaal + eerste > 180000 || !Number.isFinite(eerste)) break;
  await slaap(eerste);
  }
  throw new Error("AI-keten uitgeput");
}
