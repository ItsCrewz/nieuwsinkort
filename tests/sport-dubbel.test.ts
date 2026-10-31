// Dubbele sportitems (#440): dezelfde race in meerdere clusters. Fixture = Sport-items van de publieke data.json
// (cron 20:00, 31-10). Feedtitels staan niet in data.json; de test benadert ze uit de slugs van de href's (ft).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { achternamen, afstanden, ontdubbelSport } from "../worker/src/sportdubbel";

let n = 0;
const t = (naam: string, fn: () => void) => { fn(); n++; console.log("✓", naam); };

const slugTitel = (href: string) => (href.split("/").filter(Boolean).pop() || "").replace(/\.html$/, "").replace(/~.*$/, "").replace(/^\d+-?/, "").replace(/-/g, " ");
const items: any[] = JSON.parse(readFileSync("tests/fixtures/sport-dubbel-31-10.json", "utf8")).map((i: any) => ({ ...i, bronnen: i.bronnen.map((b: any) => ({ ...b, ft: slugTitel(b.href) })) }));
const uit = ontdubbelSport(items).items;
const met = (re: RegExp) => uit.filter((i) => re.test(i.kop));

t("fixture: 15 → 9 items, Nuis 1500 m en Kok 500 m elk één", () => {
  assert.equal(items.length, 15);
  assert.equal(uit.length, 9);
  assert.equal(met(/Nuis/).length, 1);
  const kok = met(/Kok.*500|500.*Kok/);
  assert.equal(kok.length, 1);
  assert.notEqual(met(/Nuis/)[0], kok[0]);
});

t("Nuis-item: bronnen uniek, meest complete eerst; Kok-item krijgt alleen eigen bronnen", () => {
  const nuis = met(/Nuis/)[0];
  const hrefs = nuis.bronnen.map((b: any) => b.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  // 8 unieke bronnen in de groep; plafond 6, bronnen van het meest complete item (4 bronnen, live-blogs) eerst
  assert.equal(nuis.bronnen.length, 6);
  assert.deepEqual(hrefs.slice(0, 4), items[5].bronnen.map((b: any) => b.href));
  const kok = met(/Kok.*500/)[0];
  assert.deepEqual(kok.bronnen.map((b: any) => b.site).sort(), ["NU.nl", "NU.nl", "NU.nl", "RTL Nieuws"]);
  assert.equal(kok.t, 1793470037000); // nieuwste tijd van de groep
});

t("overige items blijven apart", () => {
  for (const re of [/routinematig/, /sensatie/, /reist met/, /Van Heemst/, /Pogacar/, /Sherrock/, /starten komend weekend/]) assert.equal(met(re).length, 1, String(re));
  assert.equal(uit.filter((i) => /Lancee/.test(i.kop)).length, 2);
});

t("hulpfuncties: 1.500 = 1500, namen zonder plaats/rol", () => {
  assert.deepEqual(afstanden("Nuis wint 1.500 meter na griep"), [1500]);
  assert.deepEqual(afstanden("Kok wint 500 m"), [500]);
  assert.deepEqual(afstanden("Winnaar 5 kilometer"), [5000]);
  assert.equal(afstanden("Kok wint 500 en 1000 meter"), null);
  assert.deepEqual(achternamen("Schaatsster Femke Kok wint eerste 500 meter"), ["kok"]);
  assert.deepEqual(achternamen("Kjeld Nuis wint 1500 meter in Thialf"), ["nuis"]);
  assert.deepEqual(achternamen("Mathieu van der Poel wint"), ["poel"]);
});

const it = (kop: string, tt = 1, site = "X") => ({ cat: "sport", kop, t: tt * 3600e3, tijd: "00:00", bronnen: [{ site, href: `https://x.nl/${kop}` }] });
t("negatief: zelfde atleet ander onderdeel, zelfde afstand andere atleet", () => {
  assert.equal(ontdubbelSport([it("Femke Kok wint 500 meter"), it("Femke Kok wint 1000 meter")]).items.length, 2);
  assert.equal(ontdubbelSport([it("Femke Kok wint 500 meter in Heerenveen"), it("Jutta Leerdam wint 500 meter in Heerenveen")]).items.length, 2);
  assert.equal(ontdubbelSport([it("Femke Kok wint 500 meter"), it("Femke Bol wint 500 meter")]).items.length, 2);
  assert.equal(ontdubbelSport([it("Kok en Leerdam winnen 500 meter"), it("Kok wint 500 meter")]).items.length, 2);
  assert.equal(ontdubbelSport([it("Kok wint 500 meter"), it("Kok wint 500 meter", 20)]).items.length, 2); // >12 uur
  assert.equal(ontdubbelSport([{ ...it("Kok wint 500 meter"), cat: "nl" }, it("Kok wint 500 meter")]).items.length, 2);
  assert.equal(ontdubbelSport([it("Kok wint 500 meter"), it("Kok wint 500 meter")]).items.length, 1);
});

console.log(`\n${n} tests OK`);
