// Generieke, opeenvolgende keten met conservatieve reserveringen per model.
export type Teller = { dag: string; calls: number; tokens: number; venster: { tijd: number; tokens: number }[]; maand?: string; maandTokens?: number };
export type LlmState = Record<string, Teller>;
export type Verzoek = { sys: string; user: string; maxTokens: number; json: boolean };
export type Antwoord = { tekst: string; inTok: number; outTok: number };
// tussenpoos: minimale ms tussen twee verzoeken naar dezelfde aanbieder (over alle modellen).
export type Aanbieder = { naam: string; modellen: string[]; limieten: { rpm: number; rpd: number; tpm: number; tpd: number; maandTokens?: number; tussenpoos?: number }; call: (model: string, verzoek: Verzoek) => Promise<Antwoord> };
export const MISTRAL_TUSSENPOOS = 1100, MAX_RETRY_AFTER = 5000;

const httpFout = (r: Response) => Object.assign(new Error(`AI-aanbieder HTTP ${r.status}`), { retryAfter: r.headers.get("retry-after") });

// Retry-After in ms (seconden of HTTP-datum); undefined als hij ontbreekt of onleesbaar is.
export function retryAfterMs(waarde: string | null | undefined, nu: number): number | undefined {
  const s = waarde?.trim();
  if (!s) return undefined;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.ceil(Number(s) * 1000);
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : Math.max(0, t - nu);
}

export function groq(sleutel?: string): Aanbieder | undefined {
  if (!sleutel) return undefined;
  return { naam: "groq", modellen: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"], limieten: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
    async call(model, v) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sleutel}`, "User-Agent": "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)" }, body: JSON.stringify({ model, messages: [{ role: "system", content: v.sys }, { role: "user", content: v.user }], max_tokens: v.maxTokens, temperature: 0.3, ...(v.json ? { response_format: { type: "json_object" } } : {}) }), signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw httpFout(r);
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
      if (!r.ok) throw httpFout(r);
      const data: any = await r.json();
      const tekst = data?.choices?.[0]?.message?.content;
      if (typeof tekst !== "string" || !tekst.trim()) throw new Error("Leeg AI-antwoord");
      return { tekst, inTok: data?.usage?.prompt_tokens ?? Math.ceil((v.sys.length + v.user.length) / 3.5), outTok: data?.usage?.completion_tokens ?? Math.ceil(tekst.length / 3.5) };
    } };
}

export type Wacht = { totaal: number; nu?: () => number; slaap?: (ms: number) => Promise<void> };

export async function keten(aanbieders: Aanbieder[], state: LlmState, v: Verzoek, gebruik: (naam: string, model: string, antwoord: Antwoord) => void, wacht: Wacht = { totaal: 0 }): Promise<string> {
  const schatting = Math.ceil((v.sys.length + v.user.length) / 3.5) + v.maxTokens;
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
        const http = /^AI-aanbieder HTTP (\d{3})$/.exec(melding);
        console.error("AI-aanbieder mislukt", a.naam, model, http ? `HTTP ${http[1]}` : melding === "Leeg AI-antwoord" ? melding : "overige fout");
        if (herhaal || http?.[1] !== "429") break;
        // Eenmaal opnieuw na Retry-After (max 5 s); zonder header alleen bij een aanbieder met tussenpoos.
        const ms = retryAfterMs((e as { retryAfter?: string | null }).retryAfter, klok()) ?? (a.limieten.tussenpoos || undefined);
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
