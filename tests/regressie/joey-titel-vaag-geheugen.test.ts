// Regressie (Joey 02-11, #488): een vaag oordeel vervangt niet wat Altman zegt.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarize } from "../../worker/src/ai";
import { zuiverSom } from "../../worker/src/somcheck";

const item = JSON.parse(readFileSync("tests/fixtures/joey/nu-geheugen.json", "utf8"));
const feedtitel = "Directeur ChatGPT: het is erg dat mensen geheugen in hun pc hebben zitten";
const invoer = [{ id: 1, cat: item.cat, bronnen: ["NU.nl"], titels: [feedtitel], tekst: item.samenvatting }];
const u = { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 };
let calls = 0;
let kop = item.kop;
const ai = { run: async () => { calls++; return { response: JSON.stringify({ items: [{ id: 1, ...item, kop }] }) }; } };
const resultaat = await summarize(ai as never, "test", invoer, u);
assert.equal(resultaat.get(1)?.kop, feedtitel);
assert.equal(calls, 1, "geen extra AI-aanroep voor de kop");
assert.equal(zuiverSom(item)?.kop, item.kop, "bestaande cache blijft ongemoeid");
for (const [titel, vaag] of [
  [item.kop, true], ["Minister vindt voorstel raar!", true], ["Onderzoeker ontdekt iets", true],
  ["Bedrijf verandert dingen", true], ["Burgemeester noemt plan bizar", true],
  ["Ergens in Nederland valt sneeuw", false], ["Ergo opent kantoor", false],
  ["Schade is erger dan verwacht", false], ["Minister vindt plan erg duur", false],
  ["Minister vindt de situatie erg voor bewoners", false],
] as const) {
  kop = titel;
  const res = await summarize(ai as never, "test", invoer, u);
  assert.equal(res.get(1)?.kop, vaag ? feedtitel : titel, titel);
}
console.log("ok - vage kop valt bij nieuwe som terug, cache en concrete koppen blijven intact");
