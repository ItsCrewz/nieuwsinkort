import assert from "node:assert/strict";
import { svCache, zaaiSamenvattingen } from "../src/samenvattingcache";

svCache.clear();
zaaiSamenvattingen({ a: { punten: ["Eerste punt"], bron: "spraak" }, leeg: { punten: [], bron: "spraak" } });
assert.deepEqual(svCache.get("a"), { ok: true, punten: ["Eerste punt"], bron: "spraak", sec: undefined, cached: true });
assert.equal(svCache.has("leeg"), false);
zaaiSamenvattingen({ a: { punten: ["Ander punt"], bron: "ondertiteling" } });
const naLaden = svCache.get("a");
assert.ok(naLaden?.ok);
assert.deepEqual(naLaden.punten, ["Eerste punt"]);
console.log("✓ vooraf gemaakte videosamenvattingen blijven beschikbaar bij later laden van de feed");
