import assert from "node:assert/strict";
import { summarize, type Usage } from "../worker/src/ai";
import { clusterHash, vindClusterSum } from "../worker/src/clusterhash";

const usage = (): Usage => ({ neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 });
const items = [1, 2].map((id) => ({ id, cat: "nl", bronnen: ["Bron"], titels: ["Een titel"], tekst: "Een tekst" }));
for (const [model, verwacht] of [["hoofdmodel", 440], ["llama-3.2-1b", 380]] as const) {
  let aanvraag: any;
  const ai = { run: async (_model: string, opties: any) => { aanvraag = opties; return { response: JSON.stringify({ items: [{ id: 1, kop: "Minister opent nieuwe school", ai: "De minister opent vandaag een nieuwe school in Utrecht.", samenvatting: "De minister opent vandaag een nieuwe school. Er is plek voor 400 leerlingen.", punten: ["Plek voor 400 leerlingen", "Opening om tien uur", "Koffie voor gasten"] }, { id: 2, kop: "Brand in de haven", ai: "In de haven van Rotterdam woedt een grote brand.", samenvatting: "In de haven van Rotterdam woedt een grote brand. De brandweer is met veel wagens ter plaatse." }] }) }; } };
  const resultaat = await summarize(ai as any, model, items, usage());
  assert.equal(aanvraag.max_tokens, verwacht);
  assert.equal(aanvraag.max_completion_tokens, verwacht);
  assert.match(aanvraag.messages[1].content, /2 tot 3 korte zinnen/);
  assert.match(aanvraag.messages[1].content, /hooguit 2 korte kernpunten/);
  assert.match(aanvraag.messages[1].content, /anders een lege lijst/);
  assert.deepEqual(resultaat.get(1)?.punten, ["Plek voor 400 leerlingen", "Opening om tien uur"]);
  assert.deepEqual(resultaat.get(2)?.punten, []);
}
const titel = "Kamer stemt over nieuwe plannen voor scholen";
const hash = clusterHash(titel, "nl");
assert.ok(hash);
assert.equal(hash, clusterHash("SCHOLEN: nieuwe plannen, Kamer stemt", "nl"));
assert.notEqual(hash, clusterHash(titel, "tech"));
assert.equal(clusterHash("Het nieuws", "nl"), "");
const sums = { id: { at: 1000, kop: "Kop" } }, hashes = { [hash]: "id" };
assert.equal(vindClusterSum(hashes, sums, titel, "nl", 1000 + 24 * 3600e3 - 1), sums.id);
assert.equal(vindClusterSum(hashes, sums, titel, "nl", 1000 + 24 * 3600e3), null);
assert.equal(vindClusterSum(hashes, sums, titel, "tech", 1001), null);
assert.equal(vindClusterSum(hashes, sums, titel, "nl", 999), null);
assert.equal(vindClusterSum(hashes, {}, titel, "nl", 1001), null);
console.log("✓ AI-uitvoer en clustercache");
