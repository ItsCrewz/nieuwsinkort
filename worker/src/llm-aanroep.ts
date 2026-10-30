// Begrens ook Workers AI, dat geen AbortSignal accepteert.
export async function llmAanroep<T>(model: string, taak: () => Promise<T>, opties: { timeout?: number; slaap?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const timeout = opties.timeout ?? 20000;
  const slaap = opties.slaap ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let poging = 0; ; poging++) {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(taak), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("LLM_TIMEOUT")), timeout);
      })]);
    } catch (e) {
      const tekst = e instanceof Error ? e.message : "";
      const status = Number((e as { status?: number })?.status || /\b(429|5\d\d)\b/.exec(tekst)?.[1]);
      const code = tekst === "LLM_TIMEOUT" || /timeout|timed out/i.test(tekst) ? "LLM_TIMEOUT" : status === 429 ? "LLM_RATE_LIMIT" : status >= 500 && status < 600 ? "LLM_HTTP_5XX" : "LLM_FOUT";
      console.error(code, model, `${Date.now() - start}ms`);
      if (poging || code === "LLM_FOUT") throw e;
      await slaap(250);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}
