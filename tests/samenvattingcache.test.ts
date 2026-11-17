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

// Begrensde omvang (#1184): oudste valt af, recent gelezen blijft, verwijderd id wordt opnieuw geladen.
{
  const { SV_MAX, haalSamenvatting } = await import("../src/samenvattingcache");
  svCache.clear();
  const sv = (n: number) => ({ ok: true as const, punten: ["p" + n], bron: "spraak" as const });
  for (let i = 0; i < SV_MAX; i++) svCache.set("v" + i, sv(i));
  svCache.get("v0");
  for (let i = SV_MAX; i < SV_MAX + 50; i++) svCache.set("v" + i, sv(i));
  assert.equal(svCache.size, SV_MAX);
  assert.equal(svCache.has("v0"), true);
  assert.equal(svCache.has("v1"), false);
  assert.equal(svCache.has("v" + (SV_MAX + 49)), true);
  const oud = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (async () => { n++; return new Response(JSON.stringify(sv(1))); }) as typeof fetch;
  try {
    const r = await haalSamenvatting("v1", new AbortController().signal);
    assert.equal(r.ok, true);
    assert.equal(n, 1);
    assert.equal(svCache.has("v1"), true);
    assert.equal(svCache.size, SV_MAX);
  } finally { globalThis.fetch = oud; }
  svCache.clear();
}
