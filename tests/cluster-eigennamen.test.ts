// Draai: npm test (eigennamen-regel en samenstellingen in worker/src/cluster.ts; issue #469, wolf Bram 5x als los item)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cluster, gelijk, namen, toks, type Cand } from "../worker/src/cluster";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
let d = 0;
const c = (site: string, kop: string, s = "", cat = "nl"): Cand => ({ cat, site, href: `https://${site.toLowerCase().replace(/\W/g, "")}.nl/${++d}`, t: kop, s, d: d * 60000 });
const aantal = (...cs: Cand[]) => cluster(cs).length;

// echte feedtitels en -beschrijvingen van 1-11 (NOS, NRC, NU.nl, Telegraaf, AD)
const FIX: { t: string; s: string; href: string }[] = JSON.parse(readFileSync("tests/fixtures/wolf-bram-feeds.json", "utf8"));
const SITES = ["NOS", "NRC", "NU.nl", "Telegraaf", "AD"];
const wolf = (idx: number[] = [0, 1, 2, 3, 4]) => idx.map((i, k) => ({ cat: "nl", site: SITES[i], href: FIX[i].href, t: FIX[i].t, s: FIX[i].s, d: k * 60000 }));

t("namen: hoofdletter midden in de zin, niet aan het begin", () => {
  assert.deepEqual([...namen("Wolf Bram opgezet in Naturalis, niet iedereen is daar blij mee")].sort(), ["bram", "naturalis"]);
  assert.deepEqual([...namen("‘Bram heeft in leven moeten lijden.’ Dat zei Pieters")], ["pieter"]);
  assert.equal(namen("TRUMP WINT VERKIEZING IN OHIO").size, 0);
});
t("oorzaak: zonder de nieuwe regels geeft geen enkel fixture-paar een match (standaardregels)", () => {
  const lid = (i: number) => { const tok = toks(FIX[i].t); return { tok, tokS: new Set([...tok, ...toks(FIX[i].s.slice(0, 300))]) }; };
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) assert.equal(gelijk(lid(i), lid(j)), 0, `${i}-${j}`);
});
t("wolf Bram: vijf bronnen worden één cluster, in elke volgorde", () => {
  const perm = (a: number[]): number[][] => (a.length < 2 ? [a] : a.flatMap((x, i) => perm([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  for (const p of perm([0, 1, 2, 3, 4])) assert.equal(cluster(wolf(p)).length, 1, p.join());
  assert.equal(cluster(wolf())[0].c.length, 5);
});
t("wolf Bram: ook met alleen de twee 'verste' bronnen (NRC + AD) via een derde", () => {
  assert.equal(cluster(wolf([1, 2, 4])).length, 1);
});
t("negatief: één gedeelde eigennaam is nooit genoeg (Trump, Ajax)", () => {
  assert.equal(aantal(c("NOS", "Trump kondigt nieuwe importheffingen aan voor Chinese auto's", "President Trump zegt dat de heffingen volgende maand ingaan."), c("NU", "Trump bezoekt vrijdag overstroomd gebied in Texas", "President Trump bekijkt de schade na de zware regenval in Texas.")), 2);
  assert.equal(aantal(c("NOS", "Ajax haalt keeper Verbruggen terug van Feyenoord", "Ajax betaalt Feyenoord twee miljoen voor de keeper."), c("NU", "Ajax-fans gearresteerd bij Feyenoord-stadion", "Bij Feyenoord werden Ajax-supporters opgepakt voor vuurwerk.")), 2);
});
t("negatief: twee verschillende verhalen met dezelfde twee namen en ruime beschrijving blijven los zonder gedeeld gewoon titelwoord", () => {
  assert.equal(aantal(c("NOS", "Ajax wint van Feyenoord", "Ajax won de Klassieker in Rotterdam met 2-0 van Feyenoord door twee goals."), c("NU", "Feyenoord ontslaat trainer na Ajax", "Feyenoord ontsloeg de trainer na de nederlaag in Rotterdam tegen Ajax van twee goals.")), 2);
});
t("negatief: dezelfde uitgever twee keer is geen dubbeling (#443)", () => {
  const kopA = "Publiek ziet probleemwolf Bram in museum Naturalis", kopB = "Demonstranten bij opgezette wolf Bram";
  const s = "Bram is opgezet in Naturalis in Leiden en bezoekers kwamen kijken naar de doodgeschoten probleemwolf.";
  assert.equal(aantal(c("RTL", kopA, s), c("NU", kopB, s)), 1, "andere uitgever: samen");
  assert.equal(aantal(c("RTL", kopA, s), c("RTL", kopB, s)), 2, "zelfde uitgever: los");
});
t("negatief: een brug tussen twee losse verhalen verbindt ze niet", () => {
  const malen = c("RTL", "Aanvaller Malen scoort opnieuw voor winnend AS Roma", "Donyell Malen scoorde bij de 5-2 zege van AS Roma op Udinese in de Serie A.");
  const inter = c("AD", "Slechte generale voor Inter richting Feyenoord-uit: AC Milan te sterk in Milanese derby", "Inter verloor de Milanese derby van AC Milan voor het Champions League-duel met Feyenoord.");
  const brug = c("NU", "Inter verliest Milanese derby vlak voor duel met Feyenoord, Malen scoort weer", "Inter verloor de Milanese derby van AC Milan; Donyell Malen scoorde voor AS Roma tegen Udinese.");
  assert.ok(aantal(malen, inter, brug) >= 2);
});
t("negatief: namen die in veel kandidaten voorkomen zijn een onderwerp, geen kenmerk van één verhaal", () => {
  const ruis = Array.from({ length: 7 }, (_, i) => c(`Ruis${i}`, `Museumbezoek ${i} druk dit weekend`, `Bram en Naturalis kwamen ook ter sprake bij onderwerp ${i}.`));
  assert.ok(cluster([...wolf(), ...ruis]).filter((k) => k.c.some((x) => FIX.some((f) => f.href === x.href))).length > 1);
});
console.log(`${n} tests ok`);
