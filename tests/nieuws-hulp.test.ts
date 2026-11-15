import assert from "node:assert/strict";
import { amsterdamTime, bronLabel, cap, itemKey, pickLead, slugify, sortItems } from "../src/nieuws-hulp";

const b = (site: string, href = `https://${site}.nl/a`) => ({ site, href });
const it = (kop: string, tijd?: string, bronnen: any[] = []) => ({ kop, tijd, bronnen }) as any;

// slugify: accenten en leestekens weg, max 80 tekens
assert.equal(slugify("Één café!"), "een-cafe");
assert.equal(slugify("!!!"), "");
assert.equal(slugify("a".repeat(120)).length, 80);

// itemKey: slug, anders href van eerste bron, anders de kop zelf
assert.equal(itemKey(it("Één café!")), "een-cafe");
assert.equal(itemKey(it("!!!", undefined, [b("nu", "https://nu.nl/x")])), "https://nu.nl/x");
assert.equal(itemKey(it("!!!")), "!!!");

// bronLabel
assert.equal(bronLabel([]), "");
assert.equal(bronLabel(undefined as any), "");
assert.equal(bronLabel([b("NOS"), b("NOS", "https://nos.nl/b")]), "NOS");
assert.equal(bronLabel([b("NOS"), b("NU"), b("AD"), b("NU", "https://nu.nl/b")]), "NOS + 2");

// amsterdamTime: ongeldig = "", winter- en zomertijd
assert.equal(amsterdamTime(), "");
assert.equal(amsterdamTime("onzin"), "");
assert.equal(amsterdamTime("2026-01-15T11:30:00Z"), "12:30");
assert.equal(amsterdamTime("2026-07-15T11:30:00Z"), "13:30");

// cap
assert.equal(cap("nieuws"), "Nieuws");
assert.equal(cap(""), "");
assert.equal(cap("Al groot"), "Al groot");

// sortItems: nieuwste eerst, zonder tijd achteraan, invoer ongewijzigd
const inv = [it("a", "2026-01-01T10:00:00Z"), it("zonder"), it("c", "2026-01-01T12:00:00Z"), it("b", "2026-01-01T11:00:00Z")];
const kopie = inv.slice();
assert.deepEqual(sortItems(inv).map((x) => x.kop), ["c", "b", "a", "zonder"]);
assert.deepEqual(inv, kopie);

// pickLead: meeste unieke sites, gelijkspel de eerste, leeg = -1
assert.equal(pickLead([]), -1);
assert.equal(pickLead([it("a", "", [b("NOS")]), it("b", "", [b("NOS"), b("NU")]), it("c", "", [b("AD"), b("RTL")])]), 1);
assert.equal(pickLead([it("a", "", [b("NOS"), b("NOS", "https://nos.nl/b")]), it("b", "", [b("NU")])]), 0);
assert.equal(pickLead([it("a")]), 0);

console.log("nieuws-hulp: tests geslaagd");
