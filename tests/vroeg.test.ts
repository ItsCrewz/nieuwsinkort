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

await t("laadData valt eenmaal terug op statische data bij fout of ongeldige JSON", async () => {
  const { laadData } = await import("../src/vroeg");
  for (const respons of [new Response("fout", { status: 503 }), new Response("geen json")]) {
    const paden: string[] = [];
    const ophalen = (async (pad: string | URL | Request, opties?: RequestInit) => {
      paden.push(String(pad));
      assert.equal(opties?.cache, "no-cache");
      return Response.json({ items: [] });
    }) as typeof fetch;
    assert.deepEqual(await laadData(Promise.resolve(respons), ophalen), { items: [] });
    assert.deepEqual(paden, ["/data.json?statisch=1"]);
  }
});
