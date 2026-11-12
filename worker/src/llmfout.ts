// Eenduidige foutcodes voor LLM-aanroepen (#874): één plek voor indeling en logregel, zodat keten, chat() en Pages Function dezelfde taal spreken.
import { isDagQuota } from "../../src/budget";

export const LLM_CODES = ["LLM_TIMEOUT", "LLM_HTTP_5XX", "LLM_RATE_LIMIT", "LLM_PARSE", "LLM_BUDGET", "LLM_OVERIG"] as const;
export type LlmCode = (typeof LLM_CODES)[number];
/** Standaard time-out per verzoek (ms); `Verzoek.timeoutMs` kan dit later per aanroep overschrijven (aanhaakpunt voor timeout/retry). */
export const LLM_TIMEOUT_MS = 15000;

/** Deelt een fout in op code. Kijkt alleen naar naam en korte melding; LLM_OVERIG vangt de rest (o.a. overige 4xx), zodat geen fout zonder code blijft. */
export function llmCode(e: unknown): LlmCode {
  const naam = e instanceof Error ? e.name : "", m = e instanceof Error ? e.message : String(e ?? "");
  if (naam === "TimeoutError" || naam === "AbortError" || /time.?out|timed out/i.test(m)) return "LLM_TIMEOUT";
  if (isDagQuota(m) || /^AI-keten uitgeput/.test(m) || m === "Cloudflare niet beschikbaar") return "LLM_BUDGET";
  const http = /\bHTTP (\d{3})\b/.exec(m);
  if (http?.[1] === "429" || /rate.?limit|too many requests/i.test(m)) return "LLM_RATE_LIMIT";
  if (http && http[1][0] === "5") return "LLM_HTTP_5XX";
  if (m === "Leeg AI-antwoord" || m === "Geen geldige JSON" || m === "Geen bruikbare items") return "LLM_PARSE";
  return "LLM_OVERIG";
}

/** Eén logregel: code, bron, model en duur. Nooit prompts, antwoorden, headers of sleutels. */
export function logLlmFout(code: LlmCode, bron: string, model: string, ms: number): void {
  console.error("LLM-fout", code, bron, model, `${Math.max(0, Math.round(ms))}ms`);
}
