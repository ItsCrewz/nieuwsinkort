import { Budget } from "../worker/src/budget";

// Budget-DO met in-memory opslag en KV-spiegel, geen Cloudflare
export function budget(kv: Map<string, string> = new Map(), opties: { putFout?: () => boolean } = {}) {
  const data = new Map<string, unknown>();
  const storage = {
    get: async (k: string) => data.get(k),
    put: async (k: string, v: unknown) => { data.set(k, v); },
    delete: async (k: string | string[]) => { for (const x of [k].flat()) data.delete(x); },
    list: async ({ prefix }: { prefix: string }) => new Map([...data].filter(([k]) => k.startsWith(prefix))),
  };
  const nvKv = { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { if (opties.putFout?.()) throw new Error("KV-fout"); await Promise.resolve(); kv.set(k, v); } };
  const b = new Budget({ storage } as any, { NIEUWS: nvKv } as any);
  const call = async (actie: string, body: unknown): Promise<any> => (await b.fetch(new Request(`https://do/${actie}`, { method: "POST", body: JSON.stringify(body) }))).json();
  return { b, data, kv, call };
}
