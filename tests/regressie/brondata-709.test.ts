import assert from "node:assert/strict";
import { slim, onRequestGet } from "../../functions/data.json";

// De gemelde combinatie, aangevuld met ongeldige vermeldingen en beide diagnosevelden.
const bron = { site: "NOS", href: "https://nos.nl/artikel/123", ft: "Feedtitel", fd: "Beschrijving" };
const geldig = { site: "NOS", href: "https://nos.nl/artikel/123" };
const invoer = { items: [{ kop: "Nieuws", bronnen: [null, "ongeldig", 42, bron, geldig] }] };
assert.deepEqual(slim(invoer), { items: [{ kop: "Nieuws", bronnen: [null, "ongeldig", 42, geldig, geldig] }] });
assert.deepEqual(slim({ items: [{ bronnen: [geldig] }] }), { items: [{ bronnen: [geldig] }] });
assert.deepEqual(slim({ items: [{ bronnen: ["ongeldig", null] }] }), { items: [{ bronnen: ["ongeldig", null] }] });

// De route blijft beschikbaar en behoudt geldige bronnen na opschonen.
const data = { gegenereerd: new Date().toISOString(), items: [{ ...invoer.items[0], t: Date.now() }], filmpjes: [], dumpert: [] };
const env = { ASSETS: { fetch: async () => Response.json(data) }, NIEUWS: { get: async () => null } };
const respons = await onRequestGet({ request: new Request("https://site.test/data.json"), env });
assert.equal(respons.status, 200);
assert.deepEqual((await respons.json()).items[0].bronnen, [geldig, geldig]);
console.log("✓ #709 onvolledige brondata breekt de nieuwsrespons niet");
