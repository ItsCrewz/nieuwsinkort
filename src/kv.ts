// Houd optionele caches klein en geef het uurnieuws voorrang bij KV-schrijfproblemen.
export const begrensOg = (links: string[]) => [...new Set(links)].slice(0, 30);

export async function schrijfRun(kv: { put(key: string, value: string): Promise<unknown> }, uur: unknown, state: unknown, meer: unknown, alarm: () => Promise<void>) {
  const schrijf = async (key: string, value: unknown) => {
    try { await kv.put(key, JSON.stringify(value)); }
    catch (e) { console.error(`KV-schrijffout ${key}`, e); }
  };
  await schrijf("uur", uur);
  await Promise.all([schrijf("state", state), schrijf("meer", meer)]);
  await alarm();
}
