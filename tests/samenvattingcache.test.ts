import assert from "node:assert/strict";
import { svCache, zaaiSamenvattingen } from "../src/samenvattingcache";

svCache.clear();
zaaiSamenvattingen({ a: { punten: ["Eerste punt"], bron: "spraak" }, leeg: { punten: [], bron: "spraak" } });
assert.deepEqual(svCache.get("a"), { ok: true, punten: ["Eerste punt"], bron: "spraak", sec: undefined, cached: true });
assert.equal(svCache.has("leeg"), false);
zaaiSamenvattingen({ a: { punten: ["Ander punt"], bron: "ondertiteling" } });
assert.deepEqual(svCache.get("a")?.ok && svCache.get("a")?.punten, ["Eerste punt"]);
console.log("✓ vooraf gemaakte videosamenvattingen blijven beschikbaar bij later laden van de feed");
