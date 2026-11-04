import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { merge } from "../../functions/data.json";
import { cluster } from "../../worker/src/cluster";

const fx = JSON.parse(readFileSync("tests/fixtures/joey/dubbel-509.json", "utf8"));
const samen = (items: any[]) => merge(null, { gegenereerd: new Date().toISOString(), items }).items;
const feeds = (items: any[]) => items.map((i) => ({ cat: i.cat, site: i.bronnen[0].site, href: i.bronnen[0].href, t: i.kop, s: `${i.ai} ${i.samenvatting}`, d: i.t }));
assert.equal(samen(fx.feyenoord).length, 1, "Feyenoord: gepubliceerde kaarten");
assert.equal(samen(fx.borsato.slice(0, 3)).length, 1, "Borsato: gepubliceerde kaarten");
assert.equal(samen(fx.borsato).length, 3, "Borsato: comeback en column blijven apart");
assert.equal(samen([fx.feyenoord[0], { ...fx.feyenoord[1], kop: "Feyenoord presenteert nieuwe trainer", ai: "Feyenoord heeft een nieuwe trainer.", samenvatting: "De club presenteert de trainer." }]).length, 2, "Feyenoord: trainer blijft apart");
const nu = new Date().toISOString();
assert.equal(merge({ gegenereerd: nu, items: [fx.borsato[2]] }, { gegenereerd: nu, items: fx.borsato.slice(0, 2) }).items.length, 1, "Borsato: routine en uur samen");
assert.equal(samen([fx.borsato[0], { ...fx.borsato[1], kop: "Marco Borsato vraagt twee miljoen euro aan advocaatkosten", ai: "Marco Borsato vraagt 2000000 euro aan advocaatkosten.", samenvatting: "" }]).length, 2, "Afwijkende bedragen blijven apart");
assert.equal(cluster(feeds(fx.feyenoord)).length, 1, "Feyenoord: feedclustering");
assert.equal(cluster(feeds(fx.borsato.slice(0, 3))).length, 1, "Borsato: feedclustering");
console.log("ok - #509 gepubliceerde kaarten, feedclustering en verschillende verhalen");

const comeback = { ...fx.borsato[3], samenvatting: "De advocaatkosten uit zijn eerdere zaak waren hoog." };
assert.equal(samen([fx.borsato[0], comeback]).length, 2, "Borsato: achtergrondkosten zijn geen claim");
const varianten = [
  [fx.feyenoord[0], { ...fx.feyenoord[1], kop: "Feyenoord verliest speler aan Internazionale na transfer", ai: "", samenvatting: "" }],
  [fx.feyenoord[0], { ...fx.feyenoord[1], kop: "Feyenoord verliest trainer aan Internazionale na ontslag", ai: "", samenvatting: "" }],
  [{ ...fx.feyenoord[0], kop: "Donald Trump verliest rechtszaak van Amerika" }, { ...fx.feyenoord[1], kop: "Donald Trump verliest verkiezing van Amerika" }],
  [fx.borsato[0], { ...fx.borsato[1], kop: "Marco Borsato voor rechter in andere rechtszaak", ai: "De advocaatkosten waren hoog.", samenvatting: "" }],
];
for (const [a, b] of varianten) assert.equal(samen([a, b]).length, 2, `Verschillende gebeurtenissen: ${b.kop}`);
const routine = { ...fx.borsato[0], uur: false, samenvatting: "Routine blijft behouden", punten: ["Routinepunt"], meer: "routine-sleutel" };
const rijk = { ...fx.borsato[2], bronnen: [...fx.borsato[2].bronnen, { site: "NU.nl Voetbal", href: "https://nu.nl/extra" }] };
const bewaard = merge({ gegenereerd: nu, items: [routine] }, { gegenereerd: nu, items: [rijk] }).items[0];
assert.equal(bewaard.samenvatting, routine.samenvatting, "Routine: samenvatting behouden");
assert.deepEqual(bewaard.punten, routine.punten, "Routine: punten behouden");
assert.equal(bewaard.meer, routine.meer, "Routine: meer behouden");
assert.equal(bewaard.bronnen.filter((b: any) => b.site.startsWith("NU.nl")).length, 1, "Uitgever met rubriek normaliseren");
const wedstrijden = [
  { cat: "voetbal", site: "ESPN", href: "https://espn.nl/a", t: "Feyenoord verliest van Inter in Champions League", s: "Feyenoord verliest van Inter in de Champions League.", d: 1 },
  { cat: "voetbal", site: "NOS", href: "https://nos.nl/b", t: "Ajax verliest van Barcelona in Champions League", s: "Ajax verliest van Barcelona in de Champions League.", d: 2 },
  { cat: "voetbal", site: "RTL", href: "https://rtl.nl/c", t: "Feyenoord verliest van Inter en Ajax verliest van Barcelona in Champions League", s: "Feyenoord verliest van Inter en Ajax verliest van Barcelona.", d: 3 },
];
assert.ok(cluster(wedstrijden).length >= 2, "Overzicht verbindt verschillende wedstrijden niet");
for (const [a, b] of varianten) assert.equal(cluster(feeds([a, b])).length, 2, `Feed: verschillende gebeurtenissen: ${b.kop}`);
