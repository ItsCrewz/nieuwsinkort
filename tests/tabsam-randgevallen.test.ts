import { strict as assert } from "node:assert";
import { maakTabSam, tabSleutel, tabAiRoute } from "../worker/src/tabsam";

const geheugen = () => {
  const m = new Map<string, string>();
  return { m, kv: { async get(k: string) { return m.get(k) ?? null; }, async put(k: string, v: string) { m.set(k, v); } } };
};
const data = [{ cat: "nl", kop: "Het nieuws", ai: "Er is nieuws." }];

// Lege invoer
{
  const { m, kv } = geheugen();
  const r = await maakTabSam(kv, "nl", [], 0);
  assert.equal(r.sam.tekst, "");
  assert.equal(r.sam.ai, false);
  assert.equal(r.sam.bron, "extractief");
  assert.equal(r.geschreven, false);
  assert.equal(m.size, 0);
}
// Sleutel: ander ai-veld of lege invoer geeft stabiele, eigen hash
assert.notEqual(await tabSleutel("nl", data), await tabSleutel("nl", [{ cat: "nl", kop: "Het nieuws" }]));
assert.equal(await tabSleutel("nl", []), await tabSleutel("nl", []));
assert.match(await tabSleutel("nl", []), /^tabsam:nl:[0-9a-f]{64}$/);
// Extractief: zonder ai-tekst de kop, eerste zin, max 160 tekens, eindigt op punt
{
  const lang = "x".repeat(300);
  const r = await maakTabSam(geheugen().kv, "nl", [{ cat: "nl", kop: "Zonder punt" }, { cat: "nl", kop: lang }, { cat: "nl", kop: "Wat?", ai: "Echt waar! En meer." }, { cat: "nl", kop: "Vierde" }], 0);
  const zinnen = r.sam.tekst.split(" ");
  assert.equal(zinnen[0] + " " + zinnen[1], "Zonder punt.");
  assert.ok(r.sam.tekst.includes("x".repeat(160) + "."));
  assert.ok(!r.sam.tekst.includes("x".repeat(161)));
  assert.ok(r.sam.tekst.endsWith("Echt waar."));
  assert.ok(!r.sam.tekst.includes("Vierde"));
}
// Lege tekst uit maak() geldt als terugval en wordt niet gecachet
{
  const { m, kv } = geheugen();
  const r = await maakTabSam(kv, "nl", data, 0, async () => ({ tekst: "", bron: "cloudflare" }));
  assert.equal(r.sam.ai, false);
  assert.equal(r.sam.tekst, "Er is nieuws.");
  assert.equal(m.size, 0);
}
// Succes wordt gecachet; gegenereerd is ISO van now
{
  const { m, kv } = geheugen();
  const r = await maakTabSam(kv, "nl", data, 1e6, async () => ({ tekst: "Tekst.", bron: "extern" }));
  assert.equal(r.geschreven, true);
  assert.equal(r.sam.gegenereerd, new Date(1e6).toISOString());
  assert.ok(m.has("tabsam:nl:laatste"));
}
// Kapotte cache, niet-AI cache en cache uit de toekomst worden genegeerd
for (const cache of ["{kapot", JSON.stringify({ hash: "x", sam: { tekst: "Oud.", ai: false, bron: "extractief", gegenereerd: new Date(0).toISOString() } }), JSON.stringify({ hash: "x", sam: { tekst: "Oud.", ai: true, bron: "c", gegenereerd: new Date(5e6).toISOString() } }), JSON.stringify({ sam: { tekst: "Oud.", ai: true, bron: "c" } })]) {
  const { m, kv } = geheugen();
  m.set("tabsam:nl:laatste", cache);
  let calls = 0;
  const r = await maakTabSam(kv, "nl", data, 1e6, async () => { calls++; return { tekst: "Nieuw.", bron: "c" }; });
  assert.equal(calls, 1);
  assert.equal(r.sam.tekst, "Nieuw.");
}
// Cache van meer dan 6 uur met andere inhoud wordt ververst, met gelijke inhoud blijft hij
{
  const { kv } = geheugen();
  await maakTabSam(kv, "nl", data, 0, async () => ({ tekst: "Eerste.", bron: "c" }));
  const zelfde = await maakTabSam(kv, "nl", data, 48 * 3600e3, async () => ({ tekst: "Tweede.", bron: "c" }));
  assert.equal(zelfde.sam.tekst, "Eerste.");
  assert.equal(zelfde.geschreven, false);
}
// KV-leesfout of schrijffout breekt de samenvatting niet
{
  const stuk = { async get(): Promise<string | null> { throw new Error("kv weg"); }, async put(): Promise<unknown> { throw new Error("kv vol"); } };
  const fout = console.error; console.error = () => {};
  try {
    const r = await maakTabSam(stuk, "nl", data, 0, async () => ({ tekst: "Wel.", bron: "c" }));
    assert.equal(r.sam.tekst, "Wel.");
    assert.equal(r.sam.ai, true);
    assert.equal(r.geschreven, false);
  } finally { console.error = fout; }
}
// Routekeuze
assert.equal(tabAiRoute(0, false, false, true, true), "cloudflare");
assert.equal(tabAiRoute(0, false, true, true, true), "geen");
assert.equal(tabAiRoute(0, true, false, true, true), "extern");
assert.equal(tabAiRoute(0, false, false, false, true), "extern");
assert.equal(tabAiRoute(0, false, false, false, false), "geen");
assert.equal(tabAiRoute(3, false, false, true, false), "geen");
console.log("Tabsamenvatting randgevallen goed");
