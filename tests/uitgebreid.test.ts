import assert from "node:assert/strict";
import { uitgebreidAlineas, uitgebreidOntdubbeld, zonderUitleg } from "../src/uitgebreid";
import type { Item } from "../src/types";

const t = (naam: string, f: () => void) => { f(); console.log("ok -", naam); };
const item = (o: Partial<Item> = {}): Item => ({ cat: "nl", kop: "Kop van het bericht", ai: "", samenvatting: "", punten: [], tijd: "12:00", bronnen: [], ...o });

t("AI-tekst aanwezig wordt getoond", () => {
  assert.deepEqual(uitgebreidAlineas(item({ ai: "Kort." }), { uitleg: ["Lange uitleg.", " "], uittreksel: [{ site: "A", href: "https://a.nl", alineas: ["Bron."] }] }), ["Lange uitleg."]);
});
t("AI faalt: alineas uit de bron", () => {
  assert.deepEqual(uitgebreidAlineas(item(), { uittreksel: [{ site: "A", href: "https://a.nl", alineas: ["Eerste.", "Tweede."] }] }), ["Eerste.", "Tweede."]);
});
t("geen /meer-data: samenvatting en punten van het bericht, zonder dubbelen", () => {
  assert.deepEqual(uitgebreidAlineas(item({ ai: "Kort.", samenvatting: "Kort.", punten: ["Punt."] }), null), ["Kort.", "Punt."]);
});
t("geen bronbeschrijving en geen samenvatting: titel, nooit leeg", () => {
  assert.deepEqual(uitgebreidAlineas(item(), undefined), ["Kop van het bericht"]);
  assert.ok(uitgebreidAlineas(item({ kop: "" }), {}).join("").length > 0);
});
t("cache hergebruikt: artikel met uitleg krijgt geen tweede AI-aanroep", () => {
  const cache = { a: { uitleg: ["x"] } };
  let calls = 0;
  for (const m of zonderUitleg([{ key: "a" }, { key: "b" }], cache)) { calls++; (cache as any)[m.key] = { uitleg: ["y"] }; }
  for (const _ of zonderUitleg([{ key: "a" }, { key: "b" }], cache)) calls++;
  assert.equal(calls, 1);
});
t("twee bruikbare bronnen: alleen de eerste onder Uitgebreid (#1349)", () => {
  const o = uitgebreidOntdubbeld(item({ kop: "Brand in Haarlem" }), { uittreksel: [
    { site: "A", href: "https://a.nl", alineas: ["De brandweer blust een grote brand in een loods aan de Waarderweg."] },
    { site: "B", href: "https://b.nl", alineas: ["Een andere bron meldt dat de politie het gebied heeft afgezet voor verkeer."] },
  ] });
  assert.deepEqual(o.uitgebreid, ["De brandweer blust een grote brand in een loods aan de Waarderweg."]);
  assert.equal(o.uitleg, false);
});
t("eerste bron is alleen herhaling: de tweede bron wordt getoond (#1349)", () => {
  const zin = "De brandweer blust een grote brand in een loods aan de Waarderweg.";
  const nieuw = "De politie heeft het gebied afgezet en onderzoekt de oorzaak van de brand.";
  const o = uitgebreidOntdubbeld(item({ kop: "Brand in Haarlem", samenvatting: zin }), { uittreksel: [
    { site: "A", href: "https://a.nl", alineas: [zin] },
    { site: "B", href: "https://b.nl", alineas: [nieuw] },
  ] });
  assert.deepEqual(o.uitgebreid, [nieuw]);
});
