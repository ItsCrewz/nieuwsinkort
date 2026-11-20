import assert from "node:assert/strict";
import { naarResultaat, navTekst } from "../../src/zoekbalk";

const gefocust: string[] = [];
const maakKaart = (naam: string, link: boolean) => {
  const k = { scroll: 0, querySelector: () => (link && k.scroll >= 0 ? { focus: () => { gefocust.push(naam); } } : null), scrollIntoView: () => { k.scroll++; link = true; } };
  return k;
};
const kaarten = [maakKaart("a", true), maakKaart("b", true), maakKaart("c", false)];
const doc = { getElementById: (id: string) => (id === "zoek-resultaten" ? { querySelectorAll: () => kaarten } : null) };
let wachtend: (() => void) | null = null;
const wacht = (f: () => void) => { wachtend = f; };

assert.equal(naarResultaat(doc, 1, wacht), true);
assert.deepEqual(gefocust, ["b"]);
// kaart buiten het venster: eerst scrollen, dan opnieuw proberen
assert.equal(naarResultaat(doc, 2, wacht), false);
assert.ok(wachtend);
(wachtend as () => void)();
assert.deepEqual(gefocust, ["b", "c"]);
assert.equal(naarResultaat(doc, 9, wacht), false);
assert.equal(navTekst(2, 10), "Resultaat 3 van 10");
assert.equal(navTekst(0, 10, "eerste"), "Eerste resultaat");
assert.equal(navTekst(9, 10, "laatste"), "Laatste resultaat");
console.log("1342 zoekresultaat-navigatie: tests geslaagd");
