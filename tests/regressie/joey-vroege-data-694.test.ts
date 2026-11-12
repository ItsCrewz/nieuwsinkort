import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { laadData } from "../../src/vroeg";

const data = JSON.parse(await readFile("public/data.json", "utf8"));
const actueel = { ...data, datum: "actueel" };

for (const vroeg of [Promise.reject(new Error("netwerk")), Promise.resolve(new Response("fout", { status: 503 })), Promise.resolve(new Response("geen json")), Promise.resolve(Response.json([]))]) {
  const paden: string[] = [];
  const ophalen = (async (pad: string | URL | Request, opties?: RequestInit) => {
    paden.push(String(pad));
    assert.equal(opties?.cache, "no-cache");
    return Response.json(actueel);
  }) as typeof fetch;
  assert.deepEqual(await laadData(vroeg, ophalen), actueel);
  assert.deepEqual(paden, ["/data.json"]);
}

for (const vroeg of [Promise.resolve(new Response("fout", { status: 503 })), null]) {
  const paden: string[] = [];
  const ophalen = (async (pad: string | URL | Request, opties?: RequestInit) => {
    paden.push(String(pad));
    assert.equal(opties?.cache, "no-cache");
    return String(pad).includes("statisch=1") ? Response.json(data) : new Response("fout", { status: 503 });
  }) as typeof fetch;
  assert.deepEqual(await laadData(vroeg, ophalen), data);
  assert.deepEqual(paden, ["/data.json", "/data.json?statisch=1"]);
}

assert.deepEqual(await laadData(Promise.resolve(Response.json(actueel)), (async () => {
  throw new Error("onverwachte aanvraag");
}) as typeof fetch), actueel);
await assert.rejects(laadData(null, (async () => new Response("fout", { status: 503 })) as typeof fetch), /503/);
console.log("✓ vroege data opnieuw ophalen en statische terugval");
