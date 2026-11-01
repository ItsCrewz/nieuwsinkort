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
const perm = <T>(a: T[]): T[][] => (a.length < 2 ? [a] : a.flatMap((x, i) => perm([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
const brugSet = () => ({
  malen: c("RTL", "Aanvaller Malen scoort opnieuw voor winnend AS Roma", "Donyell Malen scoorde bij de 5-2 zege van AS Roma op Udinese in de Serie A."),
  inter: c("AD", "Slechte generale voor Inter richting Feyenoord-uit: AC Milan te sterk in Milanese derby", "Inter verloor de Milanese derby van AC Milan voor het Champions League-duel met Feyenoord."),
  brug: c("NU", "Inter verliest Milanese derby vlak voor duel met Feyenoord, Malen scoort weer", "Inter verloor de Milanese derby van AC Milan; Donyell Malen scoorde voor AS Roma tegen Udinese."),
});
t("negatief: een brug tussen twee losse verhalen verbindt ze niet, in alle 6 volgordes", () => {
  for (const p of perm(["malen", "inter", "brug"])) {
    const b = brugSet() as Record<string, Cand>;
    const k = cluster(p.map((x, i) => ({ ...b[x], d: i * 60000 })));
    const van = (x: string) => k.findIndex((cl) => cl.c.some((y) => y.href === b[x].href));
    assert.notEqual(van("malen"), van("inter"), p.join("-"));
  }
});
t("Malen/Inter in echte feedvolgorde: AD een minuut na de NU-brug voegt RTL-Malen en AD-Inter niet samen", () => {
  const b = brugSet();
  const k = cluster([{ ...b.malen, d: 0 }, { ...b.brug, d: 60000 * 5 }, { ...b.inter, d: 60000 * 6 }]);
  assert.ok(!k.some((cl) => cl.c.some((x) => x.href === b.malen.href) && cl.c.some((x) => x.href === b.inter.href)));
});
t("kern: een cluster dat via namen groeide neemt alleen nog berichten over dezelfde namen op", () => {
  for (const p of perm([0, 1, 2, 3, 4])) { const k = cluster(wolf(p)); assert.equal(k.length, 1); assert.ok(k[0].kern!.has("bram")); }
});
t("negatief: dezelfde uitgever onder een andere naam (NU.nl Voetbal = NU.nl, AD Voetbal = AD) blijft los", () => {
  const kopA = "Publiek ziet probleemwolf Bram in museum Naturalis", kopB = "Demonstranten bij opgezette wolf Bram";
  const s = "Bram is opgezet in Naturalis in Leiden en bezoekers kwamen kijken naar de doodgeschoten probleemwolf.";
  assert.equal(aantal(c("NU.nl", kopA, s), c("NU.nl Voetbal", kopB, s)), 2);
  assert.equal(aantal(c("AD", kopA, s), c("AD Voetbal", kopB, s)), 2);
  assert.equal(aantal(c("AD", kopA, s), c("NU.nl Voetbal", kopB, s)), 1);
});
t("namen: NFD en NFC geven dezelfde namen", () => {
  const nfc = "Spits Martínez scoort twee keer bij Manchester United";
  assert.deepEqual([...namen(nfc.normalize("NFD"))], [...namen(nfc.normalize("NFC"))]);
  assert.ok(namen(nfc.normalize("NFD")).has("martinez"));
});
t("negatief: namen die in veel kandidaten voorkomen zijn een onderwerp, geen kenmerk van één verhaal", () => {
  const ruis = Array.from({ length: 7 }, (_, i) => c(`Ruis${i}`, `Museumbezoek ${i} druk dit weekend`, `Bram en Naturalis kwamen ook ter sprake bij onderwerp ${i}.`));
  assert.ok(cluster([...wolf(), ...ruis]).filter((k) => k.c.some((x) => FIX.some((f) => f.href === x.href))).length > 1);
});
// echte feeds van Malen/Roma en Inter–Milan: Telegraaf en NU zijn allebei een brug (noemen beide wedstrijden)
const MI: { site: string; t: string; s: string; href: string }[] = JSON.parse(readFileSync("tests/fixtures/malen-inter-feeds.json", "utf8"));
const mi = (p: number[]): Cand[] => p.map((i, k) => ({ cat: "voetbal", site: MI[i].site, href: MI[i].href, t: MI[i].t, s: MI[i].s, d: k * 60000 }));
t("negatief: twee bruggen (Telegraaf en NU) verbinden Inter–Milan (AD) en Malen/Roma (RTL) in geen enkele van de 120 volgordes", () => {
  const ad = MI.findIndex((x) => x.site === "AD Voetbal"), rtl = MI.findIndex((x) => x.site === "RTL Nieuws");
  for (const p of perm([0, 1, 2, 3, 4])) {
    const k = cluster(mi(p));
    assert.ok(!k.some((cl) => cl.c.some((x) => x.href === MI[ad].href) && cl.c.some((x) => x.href === MI[rtl].href)), p.join());
  }
});
t("kern: één gedeelde kernnaam (milan) is niet genoeg om bij een naamcluster aan te sluiten", () => {
  const k = cluster(mi([3, 4, 1])); // NOS + RTL (Malen) en NU
  assert.ok(k.some((cl) => cl.kern && cl.c.length >= 2));
  const c2 = cluster(mi([3, 4, 1, 2])); // AD erbij
  assert.ok(!c2.some((cl) => cl.c.some((x) => x.site === "AD Voetbal") && cl.c.some((x) => x.site === "RTL Nieuws")));
});
console.log(`${n} tests ok`);
