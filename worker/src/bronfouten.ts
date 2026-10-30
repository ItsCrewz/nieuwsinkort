export type Broncode = "SRC_TIMEOUT" | "SRC_HTTP" | "SRC_PARSE" | "SRC_EMPTY";
export type Bronfout = { url: string; code: Broncode; ms: number };

export function foutcode(e: unknown, status = 0): Broncode {
  const naam = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/timeout|timed out|abort/i.test(naam)) return "SRC_TIMEOUT";
  if (status && (status < 200 || status >= 300) || /HTTP\s+\d+/i.test(naam)) return "SRC_HTTP";
  return "SRC_PARSE";
}

export async function batchesOphalen<J extends { url: string }, R extends { url: string; ok: boolean; ms: number; code?: Broncode }>(batches: J[][], haal: (batch: J[], i: number) => Promise<R[]>): Promise<R[]> {
  const uit = await Promise.all(batches.map(async (batch, i) => {
    const t = Date.now();
    try {
      const rs = await haal(batch, i);
      if (!Array.isArray(rs)) throw new Error("ongeldig batchantwoord");
      return batch.map((j) => rs.find((r) => r?.url === j.url) || ({ url: j.url, ok: false, status: 0, code: "SRC_PARSE", ms: Date.now() - t } as R));
    } catch (e) {
      return batch.map((j) => ({ url: j.url, ok: false, status: 0, code: foutcode(e), ms: Date.now() - t } as R));
    }
  }));
  return uit.flat();
}
