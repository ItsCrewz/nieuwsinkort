import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { kiesVoorAI } from "../worker/src/index";
import { summarize, inHetKort, verdiep } from "../worker/src/ai";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
await t("artikelprompts vragen B1 en behouden één call per groep", async () => {
  const calls: any[] = [];
  const ai: any = { run: async (_model: string, args: any) => { calls.push(args); return { response: '{"items":[{"id":1,"kop":"Kop","ai":"Een zin."}]}' }; } };
  const usage = { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 };
  await summarize(ai, "model", [{ id: 1, cat: "nl", bronnen: ["Bron"], titels: ["Kop"], tekst: "Tekst" }, { id: 2, cat: "nl", bronnen: [], titels: [], tekst: "Tekst" }], usage);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].max_tokens, 440);
  const opdracht = calls[0].messages[1].content;
  assert.match(opdracht, /nieuwsstijl/);
  assert.match(opdracht, /wie of wat, waar, plus het concrete feit/);
  assert.match(opdracht, /max 10 woorden en max 85 tekens/);
  assert.match(opdracht, /Geen vraag, geen uitroepteken/);
  assert.match(opdracht, /1 of 2 korte zinnen/);
  assert.match(opdracht, /waarom het ertoe doet/);
  assert.match(opdracht, /vul niets aan en gok niet/);
  await inHetKort(ai, "model", ["Bericht"], usage);
  await verdiep(ai, "model", [{ id: 1, kop: "Kop", kort: "Kort", bronnen: [] }], usage);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    const stijl = call.messages[0].content;
    assert.match(stijl, /volwassenen.*B1/);
    assert.match(stijl, /korte zinnen \(liefst hooguit 15 woorden, nooit meer dan 20\)/);
    assert.match(stijl, /jargon en moeilijke woorden kort uit/);
    assert.match(stijl, /afkortingen bij eerste gebruik voluit/i);
    assert.match(stijl, /ALLEEN feiten.*verzin niets/);
  }
});

await t("summarize: lengtelimieten en parsing ongewijzigd", async () => {
  const lang = "x".repeat(500);
  const ai: any = { run: async () => ({ response: JSON.stringify({ items: [{ id: 1, kop: lang, ai: lang, samenvatting: lang + lang, punten: ["a", "b", "c"] }, { id: 9, kop: "Kop", ai: "Zin." }, { id: 2, kop: "", ai: "Zin." }] }) }) };
  const r = await summarize(ai, "model", [{ id: 1, cat: "nl", bronnen: [], titels: [], tekst: "T" }, { id: 2, cat: "nl", bronnen: [], titels: [], tekst: "T" }], { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 });
  assert.deepEqual([...r.keys()], [1]);
  const s = r.get(1)!;
  assert.equal(s.kop.length, 90); assert.equal(s.ai.length, 240); assert.equal(s.samenvatting.length, 900); assert.equal(s.punten.length, 2);
});

await t("AI-ronde verdeelt sport binnen de limiet", async () => {
  const cats = ["nl", "tech", "haarlem", "showbizz", "voetbal", "f1", "auto"];
  const groepen = Object.fromEntries(cats.map((c) => [c, Array(20).fill(c)]));
  const picks = kiesVoorAI(groepen, 1, 40);
  assert.equal(picks.length, 40);
  for (const c of ["f1", "voetbal", "auto"]) assert.equal(picks.filter((x) => x === c).length, 1);
  const alleenNlSport = Object.fromEntries(["nl", "f1", "voetbal", "auto"].map((c) => [c, Array(40).fill(c)]));
  const beperkt = kiesVoorAI(alleenNlSport, 1, 40);
  assert.equal(beperkt.filter((x) => x === "nl").length, 37);
  assert.equal(beperkt.filter((x) => x !== "nl").length, 3);
  const tier3 = kiesVoorAI(Object.fromEntries(cats.map((c) => [c, Array(20).fill(c)])), 3, 40);
  assert.ok(tier3.every((c) => c === "nl" || c === "haarlem"));
  assert.deepEqual(kiesVoorAI({ f1: ["f1"], voetbal: ["voetbal"], auto: ["auto"] }, 1, 2), ["f1", "voetbal"]);
});

console.log(`\n${n} Worker-AI-tests geslaagd`);
