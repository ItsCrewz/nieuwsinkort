import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ontdubbelVerhalen, zelfdeVerhaal } from "../../src/verhaaldubbel";
import { cluster } from "../../worker/src/cluster";

// Live feed 13:05: "eist 391.000 euro van de staat" (NU.nl + Telegraaf) stond los van de twee RTL-kaarten
// ("voor de rechter over advocaatkosten", ruim 390.000 euro; "vraagt vier ton ... terug"). 390.000, 391.000 en vier ton zijn hetzelfde bedrag.
const fx = JSON.parse(readFileSync("tests/fixtures/joey/dubbel-borsato-1305.json", "utf8"));
const [rechter, vierTon, comeback, column, eist] = fx.items;
const v = (i: any) => ({ kop: i.kop, tekst: `${i.ai} ${i.samenvatting}`, tijd: i.t });
const cand = (i: any) => ({ cat: i.cat, site: i.bronnen[0].site, href: i.bronnen[0].href, t: i.kop, s: `${i.ai} ${i.samenvatting}`, d: i.t });
let fouten = 0;
const t = (naam: string, f: () => void) => { try { f(); } catch (e) { console.error(naam, e); fouten++; } };
t("391.000 euro, 390.000 en vier ton zijn één verhaal", () => {
  for (const x of [rechter, vierTon]) { assert.equal(zelfdeVerhaal(v(eist), v(x)), true); assert.equal(zelfdeVerhaal(v(x), v(eist)), true); }
  const uit = ontdubbelVerhalen(fx.items);
  const kostenKaart = uit.filter((i: any) => /advocaatkosten|391\.000|vier ton/.test(i.kop));
  assert.equal(kostenKaart.length, 1);
  assert.deepEqual(kostenKaart[0].bronnen.map((b: any) => b.site).sort(), ["NU.nl", "RTL Nieuws", "Telegraaf"]);
});
t("clusteren in elke volgorde geeft één kostencluster", () => {
  for (const volgorde of [[0, 1, 4], [4, 1, 0], [1, 4, 0], [4, 0, 1]]) {
    const c = cluster(volgorde.map((i) => cand(fx.items[i])));
    assert.equal(c.length, 1, volgorde.join("-"));
  }
});
t("comeback (Linda) en AD-column blijven apart", () => {
  for (const x of [comeback, column]) for (const k of [rechter, vierTon, eist]) assert.equal(zelfdeVerhaal(v(x), v(k)), false);
  assert.equal(ontdubbelVerhalen(fx.items).length, 3);
  const c = cluster([rechter, vierTon, comeback, column, eist].map(cand));
  assert.equal(c.length, 3);
});
assert.equal(fouten, 0, "Borsato 13:05");
