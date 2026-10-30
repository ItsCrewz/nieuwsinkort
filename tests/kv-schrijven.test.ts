// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { begrensOg, schrijfRun } from "../src/kv";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const resultaat = fn();
  if (resultaat instanceof Promise) return resultaat.then(klaar);
  klaar();
};

t("og-cache: maximaal 30 unieke links per run", () => {
  const links = Array.from({ length: 120 }, (_, i) => `https://nieuws.nl/${i}`);
  assert.deepEqual(begrensOg([links[0], ...links]), links.slice(0, 30));
  assert.deepEqual(begrensOg([]), []);
});

for (const fout of ["state", "meer", "uur", ""]) {
  const acties: string[] = [], fouten: string[] = [];
  const origineel = console.error;
  try {
    console.error = (melding: string) => { fouten.push(melding); };
    await schrijfRun({ put: async (key, value) => {
      acties.push(key);
      assert.equal(JSON.parse(value).test, true);
      if (key === fout) throw new Error("gesimuleerde KV-limiet");
    } }, { test: true }, { test: true }, { test: true }, async () => { acties.push("alarm"); });
  } finally { console.error = origineel; }
  t(`KV-eindschrijfacties: ${fout || "geen fout"}, uur eerst en alarm gezet`, () => {
    assert.deepEqual(acties, ["uur", "state", "meer", "alarm"]);
    assert.deepEqual(fouten, fout ? [`KV-schrijffout ${fout}`] : []);
  });
}

console.log(`\n${n} tests geslaagd`);
