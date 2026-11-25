import assert from "node:assert/strict";
import { slim, onRequestGet } from "../../functions/data.json";

// #1443: een null-bron naast een geldige bron met ft mag de respons en andere berichten niet blokkeren.
const bron = { site: "A", href: "https://example.org/a", ft: "kop", fd: "omschrijving" };
const schoonBron = { site: "A", href: "https://example.org/a" };
const ander = { site: "B", href: "https://example.org/b" };
const invoer = { ontdubbeld: 1, items: [{ kop: "Eén", bronnen: [bron, null] }, { kop: "Twee", bronnen: [ander] }] };
assert.deepEqual(slim(invoer), { items: [{ kop: "Eén", bronnen: [schoonBron, null] }, { kop: "Twee", bronnen: [ander] }] });

const nu = Date.now();
const data = { gegenereerd: new Date(nu).toISOString(), items: [{ kop: "Eén", t: nu, bronnen: [bron, null] }, { kop: "Twee", t: nu, bronnen: [ander] }], filmpjes: [], dumpert: [] };
const env = { ASSETS: { fetch: async () => Response.json(data) }, NIEUWS: { get: async () => null } };
const respons = await onRequestGet({ request: new Request("https://site.test/data.json"), env });
assert.equal(respons.status, 200);
const items = (await respons.json()).items;
assert.equal(items.length, 2);
assert.deepEqual(items.find((i: any) => i.kop === "Eén").bronnen, [schoonBron]);
assert.deepEqual(items.find((i: any) => i.kop === "Twee").bronnen, [ander]);
console.log("✓ #1443 ongeldige bron blokkeert andere berichten niet");
