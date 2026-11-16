import assert from "node:assert/strict";
import { amsterdamTime, bronLabel, cap, itemKey, pickLead, slugify, sortItems } from "../src/nieuws-hulp";
import type { Item } from "../src/types";

// Minimaal item; alleen de velden die de hulpfuncties lezen.
const item = (kop: string, tijd = "", sites: string[] = []) =>
  ({ kop, tijd, bronnen: sites.map((site) => ({ site, href: `https://${site}/a` })) }) as unknown as Item;

assert.equal(slugify("Één café, ÀÉÎ!"), "een-cafe-aei");
assert.equal(slugify("  --Hallo   Wereld--  "), "hallo-wereld");
assert.equal(slugify("a".repeat(100)).length, 80);
assert.equal(slugify("???"), "");

assert.equal(itemKey(item("Groot nieuws!")), "groot-nieuws");
assert.equal(itemKey(item("???", "", ["nu.nl", "nos.nl"])), "https://nu.nl/a");
assert.equal(itemKey({ kop: "???" } as Item), "???");

assert.equal(bronLabel([]), "");
assert.equal(bronLabel(undefined as unknown as []), "");
assert.equal(bronLabel(item("x", "", ["nu.nl"]).bronnen), "nu.nl");
assert.equal(bronLabel(item("x", "", ["nu.nl", "nu.nl"]).bronnen), "nu.nl");
assert.equal(bronLabel(item("x", "", ["nu.nl", "nos.nl", "ad.nl", "nu.nl"]).bronnen), "nu.nl + 2");

assert.equal(amsterdamTime(), "");
assert.equal(amsterdamTime(""), "");
assert.equal(amsterdamTime("geen datum"), "");
assert.equal(amsterdamTime("2026-01-15T11:30:00Z"), "12:30");
assert.equal(amsterdamTime("2026-07-15T11:30:00Z"), "13:30");

assert.equal(cap(""), "");
assert.equal(cap("nieuws"), "Nieuws");
assert.equal(cap("Nieuws"), "Nieuws");
assert.equal(cap("één"), "Één");

const invoer = [item("oud", "2026-01-01T08:00:00Z"), item("zonder"), item("nieuw", "2026-01-01T09:00:00Z")];
const gesorteerd = sortItems(invoer);
assert.deepEqual(gesorteerd.map((i) => i.kop), ["nieuw", "oud", "zonder"]);
assert.deepEqual(invoer.map((i) => i.kop), ["oud", "zonder", "nieuw"]);
assert.notEqual(gesorteerd, invoer);
assert.deepEqual(sortItems([]), []);

assert.equal(pickLead([]), -1);
assert.equal(pickLead([item("a", "", ["x"]), item("b", "", ["x", "y"]), item("c", "", ["x", "y"])]), 1);
assert.equal(pickLead([item("a", "", ["x", "x"]), item("b", "", ["y"])]), 0);
assert.equal(pickLead([{ kop: "a" } as Item, item("b", "", ["y"])]), 1);
assert.equal(pickLead([{ kop: "a" } as Item]), 0);
