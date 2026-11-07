import assert from "node:assert/strict";
import { neemVroegeData } from "../src/vroeg";

const t = async (naam: string, fn: () => void | Promise<void>) => { await fn(); console.log("✓", naam); };

await t("vroeg: promise wordt teruggegeven en van het object verwijderd", () => {
  const p = Promise.resolve(new Response("{}"));
  const w: { __vroegData?: Promise<Response> } = { __vroegData: p };
  assert.equal(neemVroegeData(w), p);
  assert.ok(!("__vroegData" in w));
  assert.equal(neemVroegeData(w), null);
});
await t("vroeg: zonder __vroegData komt null terug", () => {
  assert.equal(neemVroegeData({}), null);
});
await t("vroeg: een afgewezen promise wordt ongewijzigd teruggegeven", async () => {
  const p = Promise.reject(new Error("netwerk"));
  p.catch(() => {}); // voorkomt een unhandled rejection in de test zelf
  const w: { __vroegData?: Promise<Response> } = { __vroegData: p };
  const r = neemVroegeData(w);
  assert.equal(r, p);
  await assert.rejects(r!, /netwerk/);
  assert.equal(neemVroegeData(w), null);
});

await t("laadData probeert actuele data opnieuw na een onbruikbare vroege respons", async () => {
  const { laadData } = await import("../src/vroeg");
  for (const vroeg of [Promise.reject(new Error("netwerk")), Promise.resolve(new Response("fout", { status: 503 })), Promise.resolve(new Response("geen json")), Promise.resolve(Response.json([]))]) {
    const paden: string[] = [];
    const ophalen = (async (pad: string | URL | Request, opties?: RequestInit) => {
      paden.push(String(pad));
      assert.equal(opties?.cache, "no-cache");
      return Response.json({ actueel: true });
    }) as typeof fetch;
    assert.deepEqual(await laadData(vroeg, ophalen), { actueel: true });
    assert.deepEqual(paden, ["/data.json"]);
  }
});

await t("laadData gebruikt statische data na twee mislukte actuele aanvragen", async () => {
  const { laadData } = await import("../src/vroeg");
  const paden: string[] = [];
  const ophalen = (async (pad: string | URL | Request, opties?: RequestInit) => {
    paden.push(String(pad));
    assert.equal(opties?.cache, "no-cache");
    return paden.length === 1 ? new Response("fout", { status: 503 }) : Response.json({ statisch: true });
  }) as typeof fetch;
  assert.deepEqual(await laadData(Promise.reject(new Error("netwerk")), ophalen), { statisch: true });
  assert.deepEqual(paden, ["/data.json", "/data.json?statisch=1"]);
});

await t("laadData gebruikt een succesvolle vroege respons zonder extra aanvraag", async () => {
  const { laadData } = await import("../src/vroeg");
  const ophalen = (async () => { throw new Error("onverwachte aanvraag"); }) as typeof fetch;
  assert.deepEqual(await laadData(Promise.resolve(Response.json({ actueel: true })), ophalen), { actueel: true });
});

await t("laadData doet zonder vroege promise één actuele aanvraag en geeft een terugvalfout door", async () => {
  const { laadData } = await import("../src/vroeg");
  const paden: string[] = [];
  const ophalen = (async (pad: string | URL | Request, opties?: RequestInit) => {
    paden.push(String(pad));
    assert.equal(opties?.cache, "no-cache");
    return new Response("fout", { status: paden.length === 1 ? 503 : 404 });
  }) as typeof fetch;
  await assert.rejects(laadData(null, ophalen), /404/);
  assert.deepEqual(paden, ["/data.json", "/data.json?statisch=1"]);
});
