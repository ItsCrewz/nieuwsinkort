// #443: één bronlink per uitgever en geen koppeling van verschillende races via een live-blog als brug.
// Fixture: titels benaderd uit de Sport-items van de data.json van 31-10 22:00 (tests/fixtures/sport-dubbel-31-10.json is de 20:00-data).
import assert from "node:assert/strict";
import { afstanden, cluster, eenPerUitgever, type Cand } from "../worker/src/cluster";
import { ontdubbelSport } from "../worker/src/sportdubbel";
import { readFileSync } from "node:fs";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const cand = (site: string, t: string, d: number, s = "", cat = "nl"): Cand => ({ cat, site, href: `https://x.nl/${d}`, t, s, d });
const sport = (site: string, t: string, d: number): Cand => cand(site, t, d, "", "sport");

const NUIS = ["NU.nl", "Kjeld Nuis wint 1500 meter in Thialf na mislukte aanloop"] as const;
const LIVE = ["Telegraaf", "Live schaatsen: Nuis wint 1500 meter in Thialf, Kok wint 500 meter in Thialf"] as const;
const KOK = ["RTL Nieuws", "Femke Kok wint 500 meter in Thialf nipt voor Duizendstraal"] as const;

t("live-blog over 500 m en 1.500 m verbindt de twee races niet (elke binnenkomstvolgorde)", () => {
  for (const volgorde of [[NUIS, LIVE, KOK], [KOK, LIVE, NUIS], [LIVE, NUIS, KOK], [NUIS, KOK, LIVE]]) {
    const cs = cluster(volgorde.map(([s, ti], i) => sport(s, ti, i)));
    const nuis = cs.find((k) => k.c.some((c) => c.t === NUIS[1]))!, kok = cs.find((k) => k.c.some((c) => c.t === KOK[1]))!;
    assert.notEqual(nuis, kok, volgorde.map((v) => v[0]).join(","));
    assert.ok(!nuis.c.some((c) => c.t === KOK[1]));
  }
});

t("werkelijke feedcategorieën en bronlinks scheiden Nuis en Kok via het liveblog", () => {
  const fixture: { bronnen?: { site: string; href: string }[] }[] = JSON.parse(readFileSync("tests/fixtures/sport-dubbel-31-10.json", "utf8"));
  const bronnen = fixture.flatMap((item) => item.bronnen || []);
  const links = ["6415052/", "live-schaatsen-kjeld-nuis", "5662220/"];
  const titels = [NUIS[1], LIVE[1], KOK[1]];
  const kandidaten = links.map((link, i) => {
    const bron = bronnen.find((b) => b.href.includes(link))!;
    assert.ok(bron, link);
    return { ...cand(bron.site, titels[i], i), href: bron.href };
  });
  for (const volgorde of [[0, 1, 2], [2, 1, 0], [1, 0, 2], [0, 2, 1]]) {
    const cs = cluster(volgorde.map((n, d) => ({ ...kandidaten[n], d })));
    assert.notEqual(cs.find((k) => k.c.some((c) => c.t === NUIS[1])), cs.find((k) => k.c.some((c) => c.t === KOK[1])));
  }
});

t("zonder afstanden of met een gedeelde afstand blijft samenvoegen werken", () => {
  const cs = cluster([cand("NU.nl", "Femke Kok wint 500 meter in Thialf", 1), cand("AD", "Kok wint 500 meter in Thialf nipt", 2), cand("RTL Nieuws", "Kok verbetert baanrecord 500 meter Thialf", 3)]);
  assert.equal(cs.length, 1);
  const zonder = cluster([cand("NU.nl", "Kabinet verbiedt vuurwerk in binnenstad", 1), cand("AD", "Kabinet verbiedt vuurwerk in binnenstad nu definitief", 2)]);
  assert.equal(zonder.length, 1);
  assert.deepEqual(afstanden("Golf van 10 meter"), [10]);
  const golf = cluster([cand("NU.nl", "Storm Ciaran veroorzaakt golven van 10 meter bij Hoek van Holland", 1), cand("AD", "Storm Ciaran: golven van 12 meter bij Hoek van Holland", 2)]);
  assert.equal(golf.length, 1); // kleine maten tellen niet als race
});

t("afstandsregel alleen voor sport: kilometers en meters zonder sportcontext blijven samen", () => {
  const paren: [string, string][] = [
    ["Kabinet verlaagt maximumsnelheid snelweg overdag terug naar 130 km", "Kabinet verlaagt maximumsnelheid snelweg overdag terug naar 120 km"],
    ["Ruim 300 kilometer file door ongeluk op de A2 bij Utrecht", "Ruim 350 kilometer file door ongeluk op de A2 bij Utrecht"],
    ["Bom gevonden in Haarlem, woningen binnen 300 meter ontruimd", "Bom gevonden in Haarlem, woningen binnen 500 meter ontruimd"],
    ["Bom gevonden in Haarlem, woningen binnen 500 meter ontruimd", "Bom gevonden in Haarlem, woningen binnen 1000 meter ontruimd"],
    ["Bom gevonden in Haarlem, zwembad binnen 500 meter ontruimd", "Bom gevonden in Haarlem, zwembad binnen 1000 meter ontruimd"],
    ["Bom gevonden in Haarlem, schaatsbaan binnen 500 meter ontruimd", "Bom gevonden in Haarlem, schaatsbaan binnen 1000 meter ontruimd"],
    ["Bom gevonden in Haarlem, racebaan binnen 500 meter ontruimd", "Bom gevonden in Haarlem, racebaan binnen 1000 meter ontruimd"],
    ["Goudprijs stijgt na vondst op 500 meter diepte in mijn", "Goudprijs stijgt na vondst op 1000 meter diepte in mijn"],
    ["Recordhoogte bereikt door golven van 500 meter bij eiland", "Recordhoogte bereikt door golven van 1000 meter bij eiland"],
    ["Mijnwerkers vinden goud op 500 meter diepte in Zuid-Afrika", "Mijnwerkers vinden goud op 1000 meter diepte in Zuid-Afrika"],
  ];
  for (const [a, b] of paren) assert.equal(cluster([cand("NU.nl", a, 1), cand("AD", b, 2)]).length, 1, a);
});

t("hele sportwoorden en directe wedstrijdcontext blijven races onderscheiden", () => {
  for (const [a, b] of [
    ["Zwemster pakt goud op de 500 meter in finale", "Zwemster pakt goud op de 1000 meter in finale"],
    ["Schaatser wint de 500 meter in Heerenveen", "Schaatser wint de 1000 meter in Heerenveen"],
    ["Kok wint 500 meter in Thialf", "Kok wint 1000 meter in Thialf"],
    ["Atleet loopt 500 meter sprint in finale", "Atleet loopt 1000 meter sprint in finale"],
  ]) {
    assert.equal(cluster([sport("NU.nl", a, 1), sport("AD", b, 2)]).length, 2, a);
  }
});

t("sportfeed zonder wedstrijdcontext splitst niet op afstand", () => {
  assert.equal(cluster([sport("NU.nl", "Bom gevonden bij sporthal binnen 500 meter ontruimd", 1), sport("AD", "Bom gevonden bij sporthal binnen 1000 meter ontruimd", 2)]).length, 1);
});

t("eenPerUitgever: eerste per uitgever, 'AD Formule 1' = 'AD', volgorde stabiel", () => {
  const b = [{ site: "NU.nl", href: "1" }, { site: "AD Formule 1", href: "2" }, { site: "NU.nl Sport", href: "3" }, { site: "AD", href: "4" }, { site: "RTL Nieuws", href: "5" }];
  assert.deepEqual(eenPerUitgever(b).map((x) => x.href), ["1", "2", "5"]);
});

t("eenPerUitgever: verschillende uitgevers met hetzelfde eerste woord blijven staan", () => {
  const b = ["The Verge", "The Decoder", "Google AI Blog", "Google DeepMind", "RTL Z", "RTL Boulevard", "RTL Nieuws", "Instagram NOS", "Instagram NU.nl", "Reddit r/Haarlem", "Reddit r/thenetherlands"].map((site, i) => ({ site, href: String(i) }));
  assert.equal(eenPerUitgever(b).length, b.length);
  assert.equal(eenPerUitgever([{ site: "NU.nl Voetbal" }, { site: "NU.nl" }, { site: "AD Formule 1" }, { site: "AD Auto" }]).length, 2);
});

t("ontdubbelSport: samengevoegd item heeft één link per uitgever", () => {
  const mk = (kop: string, t: number, bronnen: [string, string][]) => ({ cat: "sport", kop, t, bronnen: bronnen.map(([site, href]) => ({ site, href })) });
  const uit = ontdubbelSport([
    mk("Femke Kok wint na fout op 500 meter", 3, [["NU.nl", "https://nu.nl/a"], ["RTL Nieuws", "https://rtl.nl/a"]]),
    mk("Femke Kok bijna onderuit op 500 meter", 2, [["NU.nl", "https://nu.nl/b"]]),
    mk("Femke Kok wint op 500 meter in Thialf", 1, [["NU.nl", "https://nu.nl/c"], ["RTL Nieuws", "https://rtl.nl/b"]]),
  ]).items;
  assert.equal(uit.length, 1);
  assert.deepEqual(uit[0].bronnen!.map((b) => b.href), ["https://nu.nl/a", "https://rtl.nl/a"]);
});
