// Eén status per afgeronde run; foutteksten blijven buiten de blijvende status (alleen log en respons).
export interface RunStatus { faalReeks: number; laatsteFout: string | null; laatsteOk: string | null }
interface Storage { get<T>(key: string): Promise<T | undefined>; put(key: string, value: RunStatus): Promise<void> }
interface KV { put(key: string, value: string): Promise<void> }

/** Beleid voor de KV-kopie (#452): `laatsteOk` verandert bij elke geslaagde run, dus zonder beleid is dat een KV-write per run. */
export interface KvBeleid { mag(nieuw: RunStatus, oud: RunStatus): Promise<boolean>; gedaan(): Promise<void> }

export async function bewaakteRun(run: () => Promise<unknown>, storage: Storage, kv: KV, kvBeleid?: KvBeleid): Promise<Response> {
  let response: Response;
  try {
    response = Response.json(await run());
  } catch (e: any) {
    console.error(e?.stack || e);
    response = Response.json({ ok: false, err: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
  try {
    const oud = await storage.get<RunStatus>("run-status") || { faalReeks: 0, laatsteFout: null, laatsteOk: null };
    const nu = new Date().toISOString();
    const status: RunStatus = response.ok
      ? { ...oud, faalReeks: 0, laatsteOk: nu }
      : { ...oud, faalReeks: oud.faalReeks + 1, laatsteFout: nu };
    if (JSON.stringify(status) !== JSON.stringify(oud)) {
      await storage.put("run-status", status);
      if (!kvBeleid || await kvBeleid.mag(status, oud)) {
        await kv.put("run-status", JSON.stringify(status));
        await kvBeleid?.gedaan();
      }
    }
  } catch {
    console.error("run-status opslaan mislukt");
  }
  return response;
}
