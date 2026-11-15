// Productie-aanroep van Workers AI (#873): timeout en hooguit één retry met backoff, plus foutclassificatie op echte Workers AI-fouten.
// Gedeeld door de uur-Worker en /samenvatting. Klok, timer en slaap zijn injecteerbaar zodat tests geen echte tijd nodig hebben.
export const LLM_TIMEOUT_STANDAARD = 45e3; // ms; ruim boven een gewone call (±5-20 s), ruim onder de Worker-limiet
export const LLM_BACKOFF = 1500; // ms wachten voor de ene retry
export const WHISPER_TIMEOUT = 60e3; // ms; Whisper krijgt wel een timeout, nooit een retry

/** Timeout uit env LLM_TIMEOUT_MS (tussen 1 en 120 s); ongeldig of leeg = standaard. */
export function llmTimeoutMs(s?: string | number): number {
  const n = Number(s);
  return s !== undefined && s !== "" && Number.isFinite(n) && n >= 1e3 ? Math.min(120e3, n) : LLM_TIMEOUT_STANDAARD;
}

/** Bewust zonder het woord "timeout" in het bericht: de budgetmeting (`meetFout`) moet dit als een call zien die toch kan kosten. */
export class LlmTimeout extends Error {
  constructor(public ms: number) { super(`Geen antwoord binnen ${ms} ms`); this.name = "LlmTimeout"; }
}

export type FoutSoort = "timeout" | "5xx" | "429" | "dagquota" | "overig";
const statusVan = (e: any): number => {
  for (const v of [e?.status, e?.statusCode, e?.response?.status]) if (Number.isInteger(v) && v >= 100 && v <= 599) return v;
  return 0;
};
/**
 * Alleen gestructureerde velden en herkenbare Workers AI-vormen tellen: `status`, het codeveld, "3043: ..." aan het begin, of "HTTP 503".
 * Een los getal in vrije tekst ("na 503 woorden") is nooit een status.
 */
export function classificeer(e: any): FoutSoort {
  if (e instanceof LlmTimeout || e?.name === "TimeoutError") return "timeout";
  const tekst = String(e?.message ?? e ?? "");
  const code = Number(e?.code) || Number(/^\s*(?:AiError:\s*)?(\d{4}):/.exec(tekst)?.[1]) || 0;
  if (code === 4006 || /daily free allocation|used up your daily/i.test(tekst)) return "dagquota";
  const status = statusVan(e) || Number(/\b(?:HTTP|status(?: code)?)[ :]+([1-5]\d\d)\b/i.exec(tekst)?.[1]) || 0;
  if (status === 429 || code === 3040) return "429"; // 3040 = capaciteit tijdelijk op: zelfde behandeling als rate limit
  if (status >= 500 || code === 3043) return "5xx";
  return "overig";
}

export type Timer = { zet(f: () => void, ms: number): unknown; wis(h: unknown): void };
const echteTimer: Timer = { zet: (f, ms) => setTimeout(f, ms), wis: (h) => clearTimeout(h as any) };

/** Wacht op `run`, maar geeft het op na `ms`. De onderliggende call wordt niet afgebroken (ai.run kent geen signal) en kan dus nog kosten. */
export async function metTimeout<T>(run: () => Promise<T>, ms: number, timer: Timer = echteTimer): Promise<T> {
  let h: unknown;
  const wacht = new Promise<never>((_, nee) => { h = timer.zet(() => nee(new LlmTimeout(ms)), ms); });
  const p = run();
  p.catch(() => {}); // een laat mislukkende call na de timeout mag geen onverwerkte rejection geven
  try { return await Promise.race([p, wacht]); } finally { timer.wis(h); }
}

export type RetryOpties = {
  model: string; timeoutMs: number;
  onFout?: (e: unknown, soort: FoutSoort) => void; // elke mislukte poging, ook de laatste: hier hoort de budgetmeting
  nu?: () => number; timer?: Timer; slaap?: (ms: number) => Promise<void>; backoffMs?: number;
  log?: (regel: string) => void;
  magRetry?: () => boolean; // budgetcheck vóór de retry na een timeout; zonder callback of bij false geen retry (de eerste call loopt door en kan nog kosten)
};
/** Eén poging plus hooguit één retry, alleen bij timeout (mits `magRetry` ja zegt) of 5xx. 429 en dagquota gaan direct door naar de aanroeper (die valt terug op een andere aanbieder). */
export async function metRetry<T>(run: () => Promise<T>, o: RetryOpties): Promise<T> {
  const nu = o.nu ?? Date.now, log = o.log ?? ((r) => console.error(r));
  const slaap = o.slaap ?? ((ms) => new Promise<void>((k) => setTimeout(k, ms)));
  for (let poging = 1; ; poging++) {
    const t0 = nu();
    try { return await metTimeout(run, o.timeoutMs, o.timer); }
    catch (e) {
      const soort = classificeer(e);
      log(`llm: ${soort} model=${o.model} duur=${nu() - t0}ms poging=${poging}`); // nooit prompt, antwoord of sleutels
      o.onFout?.(e, soort);
      if (poging >= 2 || (soort !== "timeout" && soort !== "5xx")) throw e;
      if (soort === "timeout" && !o.magRetry?.()) throw e; // niet-afgebroken eerste call: geen tweede zonder ruimte
      await slaap(o.backoffMs ?? LLM_BACKOFF);
    }
  }
}
