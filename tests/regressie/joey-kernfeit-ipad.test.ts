// Regressie (Joey 02-11, #488): "ontbrak het belangrijke stukje van hoe groot de capaciteit was" — iPad mini 4.900 mAh (vorig model 5.034 mAh) stond alleen in Uitgebreid.
// De samenvattingsprompt eist het belangrijkste concrete getal in ai of samenvatting; kernfeitOntbreekt() is de deterministische controle.
// Echte itemdata + begin van het Bright-artikel: tests/fixtures/joey/ipad.json.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarize, type Usage } from "../../worker/src/ai";
import type { Item, Meer } from "../../src/types";

const fx = JSON.parse(readFileSync("tests/fixtures/joey/ipad.json", "utf8")) as { item: Item; brontekst: string; meer: Meer };
const t = (naam: string, f: () => void | Promise<void>) => Promise.resolve(f()).then(() => console.log("ok -", naam));

await t("samenvattingsprompt eist het belangrijkste getal in ai of samenvatting, niet pas later", async () => {
  let prompt = "";
  const ai = { run: async (_m: string, o: any) => { prompt = o.messages[1].content; return { response: JSON.stringify({ items: [] }) }; } };
  const u: Usage = { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 };
  await summarize(ai as any, "@cf/google/gemma-4-26b-a4b-it", [{ id: 1, cat: "tech", bronnen: ["Bright"], titels: [fx.item.kop], tekst: fx.brontekst }], u);
  assert.match(prompt, /belangrijkste concrete getal \(aantal, bedrag, capaciteit, percentage, datum\)/);
  assert.match(prompt, /in "ai" of "samenvatting"/);
  assert.ok(prompt.includes("4.900 mAh"), "de brontekst zit in de invoer");
});

const { kernGetallen, kernfeitOntbreekt } = await import("../../worker/src/somcheck");
const { uitgebreidOntdubbeld } = await import("../../src/uitgebreid");

await t("de live samenvatting zonder 4.900 mAh wordt gemarkeerd als kernfeit ontbreekt", () => {
  assert.deepEqual(kernGetallen(fx.brontekst), ["4900", "5034"]);
  assert.equal(kernfeitOntbreekt(fx.item, fx.brontekst), true);
});

await t("met het getal in ai of samenvatting ontbreekt er niets; getal zonder bron-getal is nooit een fout", () => {
  assert.equal(kernfeitOntbreekt({ ai: "De nieuwe iPad mini heeft een batterij van 4.900 mAh, het vorige model 5.034 mAh.", samenvatting: "" }, fx.brontekst), false);
  assert.equal(kernfeitOntbreekt({ ai: "Kleinere accu.", samenvatting: "Het vorige model had 5034 mAh." }, fx.brontekst), false);
  assert.equal(kernfeitOntbreekt({ ai: "Kleinere accu.", samenvatting: "" }, "Een tekst zonder getallen in 2027."), false);
});

await t("Uitgebreid houdt de zinnen met de capaciteit (nieuw t.o.v. intro en samenvatting)", () => {
  const uit = uitgebreidOntdubbeld(fx.item, fx.meer).uitgebreid.join(" ");
  assert.ok(uit.includes("4.900") && uit.includes("5.034"));
});
