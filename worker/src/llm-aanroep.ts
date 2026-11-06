// Begrens ook Workers AI, dat geen AbortSignal accepteert.
export async function llmAanroep<T>(model: string, taak: () => Promise<T>, opties: { timeout?: number; slaap?: (ms: number) => Promise<void>; herhaal?: boolean; timer?: (ms: number) => { wacht: Promise<never>; stop: () => void } } = {}): Promise<T> {
  const timeout = opties.timeout ?? 20000;
  const slaap = opties.slaap ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let poging = 0; ; poging++) {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grens = opties.timer?.(timeout) ?? { wacht: new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("LLM_TIMEOUT")), timeout); }), stop: () => { if (timer !== undefined) clearTimeout(timer); } };
    try {
      return await Promise.race([Promise.resolve().then(taak), grens.wacht]);
    } catch (e) {
      const tekst = e instanceof Error ? e.message : "";
      const status = Number((e as { status?: number })?.status);
      const code = /\b4006\b|daily free allocation|daily (?:neuron|quota|limit|allocation)/i.test(tekst) ? "LLM_BUDGET" : tekst === "LLM_TIMEOUT" || /timeout|timed out/i.test(tekst) ? "LLM_TIMEOUT" : status === 429 ? "LLM_RATE_LIMIT" : status >= 500 && status < 600 ? "LLM_HTTP_5XX" : "LLM_FOUT";
      console.error(`LLM code=${code} model=${model} duur=${Date.now() - start}ms`);
      if (opties.herhaal === false || poging || (code !== "LLM_TIMEOUT" && code !== "LLM_HTTP_5XX")) throw e;
      await slaap(250);
    } finally { grens.stop(); }
  }
}
