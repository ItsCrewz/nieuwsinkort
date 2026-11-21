import assert from "node:assert/strict";
import { vergrendelScroll } from "../src/scrollslot";

// Lokale doubles, geen DOM.
const g = globalThis as any;
const html = { style: { overflow: "" } };
const body = { style: { overflow: "auto" } };
g.document = { documentElement: html, body };

const a = vergrendelScroll();
assert.equal(body.style.overflow, "hidden");
assert.equal(html.style.overflow, "hidden");
a();
assert.equal(body.style.overflow, "auto");
assert.equal(html.style.overflow, "");

// Overlap, eerste sluit eerst.
const b = vergrendelScroll(), c = vergrendelScroll();
b();
assert.equal(body.style.overflow, "hidden");
c();
assert.equal(body.style.overflow, "auto");
assert.equal(html.style.overflow, "");

// Overlap, omgekeerde volgorde, plus dubbel sluiten en heropenen.
const d = vergrendelScroll(), e = vergrendelScroll();
e(); e();
assert.equal(body.style.overflow, "hidden");
d();
assert.equal(body.style.overflow, "auto");
const f = vergrendelScroll();
assert.equal(body.style.overflow, "hidden");
f();
assert.equal(body.style.overflow, "auto");

// Zonder documentElement (andere testdoubles) geen fout.
g.document = { body };
vergrendelScroll()();
assert.equal(body.style.overflow, "auto");
console.log("scrollslot: tests geslaagd");
