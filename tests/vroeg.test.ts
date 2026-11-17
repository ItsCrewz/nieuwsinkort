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


const { laadData } = await import("../src/vroeg");
const uitgesteld = <T>() => {
  let los!: (waarde: T) => void;
  const promise = new Promise<T>((resolve) => { los = resolve; });
  return { promise, los };
};
await t("vroeg: vastgelopen respons en body vallen terug, late antwoorden veranderen het resultaat niet", async () => {
  for (const body of [false, true]) {
    const laat = uitgesteld<any>();
    const vroeg = body ? Promise.resolve({ ok: true, json: () => laat.promise } as Response) : laat.promise;
    const resultaat = laadData(vroeg, (async () => Response.json({ versie: "nieuw" })) as typeof fetch, 5);
    assert.deepEqual(await resultaat, { versie: "nieuw" });
    laat.los(body ? { versie: "oud" } : Response.json({ versie: "oud" }));
    assert.deepEqual(await resultaat, { versie: "nieuw" });
  }
});
await t("vroeg: ook actuele en statische respons of body hebben een tijdslimiet", async () => {
  for (const body of [false, true]) {
    const paden: string[] = [];
    const ophalen = ((pad: string | URL | Request) => {
      paden.push(String(pad));
      return body ? Promise.resolve({ ok: true, json: () => new Promise(() => {}) } as Response) : new Promise<Response>(() => {});
    }) as typeof fetch;
    await assert.rejects(laadData(null, ophalen, 5), /Laadtijd verstreken/);
    assert.deepEqual(paden, ["/data.json", "/data.json?statisch=1"]);
  }
});
