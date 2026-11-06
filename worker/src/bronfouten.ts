export type Broncode = "SRC_TIMEOUT" | "SRC_HTTP" | "SRC_PARSE" | "SRC_EMPTY";
export type Bronfout = { url: string; code: Broncode; ms: number };

export function foutcode(e: unknown, status = 0): Broncode {
  const naam = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/timeout|timed out|abort/i.test(naam)) return "SRC_TIMEOUT";
  if (status && (status < 200 || status >= 300) || /HTTP\s+\d+/i.test(naam)) return "SRC_HTTP";
  return "SRC_PARSE";
}

export async function batchesOphalen<J extends { url: string }, R extends { url: string; ok: boolean; ms: number; code?: Broncode }>(batches: J[][], haal: (batch: J[], i: number) => Promise<R[]>, fout: (url: string, code: Broncode, ms: number) => R, timeoutMs = 180000): Promise<R[]> {
  const uit = await Promise.all(batches.map(async (batch, i) => {
    const t = Date.now();
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const rs = await Promise.race([haal(batch, i), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("batch timeout")), timeoutMs); })]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
      if (!Array.isArray(rs)) throw new Error("ongeldig batchantwoord");
      return batch.map((j) => rs.find((r) => r?.url === j.url) || fout(j.url, "SRC_PARSE", Date.now() - t));
    } catch (e) {
      return batch.map((j) => fout(j.url, foutcode(e), Date.now() - t));
    }
  }));
  return uit.flat();
}
