import assert from "node:assert/strict";
import { maakVorigBezoek } from "../../src/filters";

const lokaal = "nieuwsinkort-laatste-bezoek";
const vorig = "1793350800000";
const g = globalThis as any;

for (const fout of ["geen", "lezen", "schrijven", "beide"] as const) {
  const lokaleWaarden = new Map([[lokaal, vorig]]);
  const sessieWaarden = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => { if (fout === "beide") throw Error(); return lokaleWaarden.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (fout === "beide") throw Error(); lokaleWaarden.set(k, v); },
  };
  g.sessionStorage = {
    getItem: (k: string) => { if (fout === "lezen" || fout === "beide") throw Error(); return sessieWaarden.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (fout === "schrijven" || fout === "beide") throw Error(); sessieWaarden.set(k, v); },
  };
  const lees = maakVorigBezoek();
  assert.equal(lees(), fout === "beide" ? 0 : Number(vorig), fout);
  lokaleWaarden.set(lokaal, "1793354400000");
  assert.equal(lees(), fout === "beide" ? 0 : Number(vorig), `${fout}: referentie blijft vast`);
  if (fout === "geen") assert.equal(maakVorigBezoek()(), Number(vorig), "sessieopslag bewaart referentie bij herladen");
}

g.sessionStorage = { getItem: () => "ongeldig", setItem: () => {} };
g.localStorage = { getItem: () => vorig };
assert.equal(maakVorigBezoek()(), Number(vorig));
g.localStorage = { getItem: () => "Infinity" };
assert.equal(maakVorigBezoek()(), 0);
console.log("✓ vorig bezoek bij normale en geblokkeerde opslag");
