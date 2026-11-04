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
