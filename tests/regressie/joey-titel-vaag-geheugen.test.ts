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
  ["Verstappen vindt mislopen van poleposition niet erg", false],
  ["Koning bezoekt tentoonstelling over het internet der dingen", false],
  ["Het voorstel is erg goed", false], ["Het gebouw is erg groot", false],
] as const) {
  kop = titel;
  const res = await summarize(ai as never, "test", invoer, u);
  assert.equal(res.get(1)?.kop, vaag ? feedtitel : titel, titel);
}
console.log("ok - vage kop valt bij nieuwe som terug, cache en concrete koppen blijven intact");

const lang = "Een uitvoerige feedtitel over het aangekondigde nieuwe plan van de minister voor de woningen in Nederlandse gemeenten";
const antwoord = { id: 1, kop: "Minister vindt plan erg", ai: "De minister presenteert een voorstel voor woningbouw in gemeenten met extra geld voor lokale projecten en ondersteuning voor bewoners.", samenvatting: "De gemeenten krijgen ondersteuning bij de uitvoering van de nieuwe plannen.", punten: [] };
let aantal = 0;
const model = { run: async () => { aantal++; return { response: JSON.stringify({ items: [antwoord] }) }; } };
const langResultaat = await summarize(model as never, "test", [{ ...invoer[0], titels: [lang] }], u);
assert.ok(langResultaat.get(1)?.kop.startsWith("Een uitvoerige feedtitel"));
assert.equal(aantal, 1);
const gelijk = await summarize(model as never, "test", [{ ...invoer[0], titels: [antwoord.ai] }], u);
assert.equal(gelijk.get(1)?.kop, antwoord.kop);
assert.equal(aantal, 2);

const samenvattingGelijk = await summarize(model as never, "test", [{ ...invoer[0], titels: [antwoord.samenvatting] }], u);
assert.equal(samenvattingGelijk.get(1)?.kop, antwoord.kop);
assert.equal(aantal, 3, "kopcontrole veroorzaakt geen extra AI-aanroep");
