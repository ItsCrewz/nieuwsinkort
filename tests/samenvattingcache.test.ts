import assert from "node:assert/strict";
import { svCache, zaaiSamenvattingen } from "../src/samenvattingcache";

svCache.clear();
zaaiSamenvattingen({ a: { punten: ["Eerste punt"], bron: "spraak" }, leeg: { punten: [], bron: "spraak" } });
assert.deepEqual(svCache.get("a"), { ok: true, punten: ["Eerste punt"], bron: "spraak", sec: undefined, cached: true });
assert.equal(svCache.has("leeg"), false);
zaaiSamenvattingen({ a: { punten: ["Ander punt"], bron: "ondertiteling" } });
const naLaden = svCache.get("a");
assert.ok(naLaden?.ok);
assert.deepEqual(naLaden.punten, ["Ander punt"]);
console.log("✓ nieuwe geldige vooraf gemaakte samenvatting vervangt de oude");

// identiek: zelfde object blijft staan; ongeldig/ontbrekend wist niets; andere video's ongemoeid
zaaiSamenvattingen({ b: { punten: ["B-punt"], bron: "spraak" } });
const b = svCache.get("b");
zaaiSamenvattingen({ b: { punten: ["B-punt"], bron: "spraak" } });
assert.equal(svCache.get("b"), b);
zaaiSamenvattingen({ a: { punten: [], bron: "spraak" }, b: { punten: ["", "x"], bron: "spraak" } as any });
zaaiSamenvattingen(undefined);
zaaiSamenvattingen({});
const a2 = svCache.get("a");
assert.ok(a2?.ok);
assert.deepEqual(a2.punten, ["Ander punt"]);
assert.equal(svCache.get("b"), b);
console.log("✓ identieke data zonder wijziging, ongeldige of ontbrekende data wist niets");
