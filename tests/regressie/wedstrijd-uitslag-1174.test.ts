import assert from "node:assert/strict";
import { ontdubbelVerhalen, zelfdeVerhaal } from "../../src/verhaaldubbel";

const item = (kop: string, site: string) => ({ kop, ai: "Een voetbalwedstrijd.", t: 1700000000000, bronnen: [{ site, href: `https://${site}.nl` }] });
const verhaal = (i: ReturnType<typeof item>) => ({ kop: i.kop, tekst: i.ai, tijd: i.t });
const a = item("Arsenal verliest met 1-2 van Chelsea", "eerste");
const gelijk = item("Arsenal verloor nipt met 1–2 van Chelsea", "tweede");
const anders = item("Arsenal verliest met 0-3 van Chelsea", "derde");
const omgekeerd = item("Chelsea verliest met 2-1 van Arsenal", "vierde");
const omgekeerdAnders = item("Chelsea verliest met 1-2 van Arsenal", "vijfde");
const zonder = item("Arsenal verliest van Chelsea", "zesde");
const onduidelijk = item("Arsenal verliest van Chelsea na eerdere 0-3", "zevende");

for (const [b, verwacht] of [[gelijk, true], [anders, false], [omgekeerd, true], [omgekeerdAnders, false], [zonder, true], [onduidelijk, true]] as const) {
  assert.equal(zelfdeVerhaal(verhaal(a), verhaal(b)), verwacht, b.kop);
  assert.equal(zelfdeVerhaal(verhaal(b), verhaal(a)), verwacht, b.kop);
  for (const volgorde of [[a, b], [b, a]]) {
    const uit = ontdubbelVerhalen(volgorde);
    assert.equal(uit.length, verwacht ? 1 : 2, b.kop);
    if (verwacht) assert.equal(uit[0].bronnen.length, 2, b.kop);
  }
}
// Een bericht zonder score mag verschillende uitslagen niet via een tussenstap verbinden.
for (const volgorde of [[a, zonder, anders], [anders, zonder, a]]) assert.equal(ontdubbelVerhalen(volgorde).length, 2);
