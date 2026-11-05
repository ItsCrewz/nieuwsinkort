import assert from "node:assert/strict";
import { svCache, zaaiSamenvattingen } from "../../src/samenvattingcache";

// Bestaande videofixture uit joey-yt-ondertitels-494; de punten zijn testdata.
const id = "OojWxAiS5ew";
const fout = { ok: false, code: "geen-tekst", fout: "Geen tekst beschikbaar" } as const;
svCache.clear();
svCache.set(id, fout);
zaaiSamenvattingen({ [id]: { punten: ["Een beschikbaar punt"], bron: "spraak" } });
const heropend = svCache.get(id);
assert.deepEqual(heropend, { ok: true, punten: ["Een beschikbaar punt"], bron: "spraak", sec: undefined, cached: true });

zaaiSamenvattingen({ [id]: { punten: ["Een ander punt"], bron: "ondertiteling" } });
assert.equal(svCache.get(id), heropend);
for (const punten of [[], ["  "], [42], ["Geldig", null]]) {
  zaaiSamenvattingen({ [id]: { punten, bron: "spraak" } } as never);
  assert.equal(svCache.get(id), heropend);
  svCache.set("fout", fout);
  zaaiSamenvattingen({ fout: { punten, bron: "spraak" } } as never);
  assert.equal(svCache.get("fout"), fout);
}
zaaiSamenvattingen({ fout: { punten: ["Punt"], bron: "ongeldig" } } as never);
assert.equal(svCache.get("fout"), fout);
svCache.clear();
