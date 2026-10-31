// Sport uit algemene feeds (#425): samenstellingen, motorsport en de herindeling na de AI-stap.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sportCat, sportCatItem } from "../worker/src/sportcat";

let n = 0;
const t = (naam: string, fn: () => void) => { fn(); n++; console.log("✓", naam); };
const check = (kop: string, hrefs: string[] = [], cat = "nl") => sportCat({ cat, kop, hrefs });

t("voetbalsamenstellingen en motorsport", () => {
  assert.equal(check("Discussie over voetballer Owen Wijndal", ["https://www.telegraaf.nl/video/pittige-discussie-over-owan-wijndal-een-grote-pr-machine/1"]), "voetbal");
  assert.equal(check("Amateurvoetballer scoort prachtig doelpunt"), "voetbal");
  assert.equal(check("Jorge Martin vreest verlies wereldtitel", ["https://www.telegraaf.nl/sport/motogp/x", "https://www.rtl.nl/nieuws/sport/artikel/1/coureur-martin"]), "auto");
  assert.equal(check("Martin somber", ["https://www.rtl.nl/nieuws/sport/artikel/1/x"]), null);
  assert.equal(check("Coureur Martin somber", ["https://www.rtl.nl/nieuws/sport/artikel/1/x"]), "auto");
  assert.equal(check("MotoGP-coureur gewond na val"), "auto");
  assert.equal(check("Isack Hadjar moet zich melden bij stewards"), "f1");
  assert.equal(check("Isack Hadjar start vanaf pole position", ["https://www.telegraaf.nl/sport/autosport/x"]), "f1");
  assert.equal(check("Nieuwe regels", ["https://www.telegraaf.nl/sport/autosport/x"]), "auto");
  assert.equal(check("Sven Mijnans keert terug bij PSV"), "voetbal");
  assert.equal(check("Mika Godts scoort voor PSG", ["https://www.nu.nl/voetbal/1"]), "voetbal");
});

t("losse woorden zijn geen sportsignaal", () => {
  for (const kop of ["Zakaria redt twee mannen uit auto", "Club van Haarlemse ondernemers opent buurthuis", "Kookwedstrijd in Zoetermeer trekt honderden bezoekers", "Race tegen de klok om migranten te redden bij Cadzand", "Steden bereiden zich voor op protesten", "Wesley Sneijder verrast publiek bij concert Jannes", "Team van artsen opereert Siamese tweeling", "Finale van Heel Holland Bakt", "Oud-voetballer Sneijder verrast publiek"]) assert.equal(check(kop), null, kop);
});

t("live-kopie 31-10: alleen echte sportitems verhuizen", () => {
  const items: { kop: string; hrefs: string[] }[] = JSON.parse(readFileSync("tests/fixtures/live-nl-31-10.json", "utf8"));
  const verhuisd = items.filter((i) => sportCat({ cat: "nl", kop: i.kop, hrefs: i.hrefs })).map((i) => i.kop).sort();
  assert.deepEqual(verhuisd, ["Amateurvoetballer scoort prachtig doelpunt", "Discussie over voetballer Owen Wijndal", "Jorge Martin vreest verlies wereldtitel"]);
});

t("herindeling na de AI-stap: AI-kop en bestaande nl-items", () => {
  // Feedtitel zonder signaal, AI-kop met "voetballer": zoals in index.ts na de AI-stap
  const hrefs = ["https://www.telegraaf.nl/video/x/1"];
  assert.equal(check("Pittige discussie over Owen Wijndal", hrefs), null);
  const items = [{ cat: "nl", kop: "Discussie over voetballer Owen Wijndal", bronnen: hrefs.map((href) => ({ href })) }, { cat: "politiek", kop: "Voetballer in Kamer", bronnen: [] }];
  for (const i of items) i.cat = sportCat({ cat: i.cat, kop: i.kop, hrefs: i.bronnen.map((b) => b.href) }) || i.cat;
  assert.deepEqual(items.map((i) => i.cat), ["voetbal", "politiek"]);
});

t("feedtitel i.p.v. AI-kop (#433)", () => {
  const href = "https://www.telegraaf.nl/video/pittige-discussie-over-owen-wijndal-een-grote-pr-machine/163868873.html";
  const AI = "Mike Verweij en Valentijn Driessen discussiëren over Owen Wijndal";
  for (const ft of ["Pittige discussie over voetballer Owen Wijndal", "Discussie over voetballer Owen Wijndal"]) {
    assert.equal(sportCatItem({ cat: "nl", kop: AI, bronnen: [{ href, ft }] }), "voetbal", ft);
    // item uit een eerdere run: zelfde pad via opgeslagen bronnen
    const eerder = JSON.parse(JSON.stringify({ cat: "nl", kop: AI, bronnen: [{ site: "Telegraaf", href, ft }] }));
    eerder.cat = sportCatItem(eerder) || eerder.cat;
    assert.equal(eerder.cat, "voetbal");
  }
  assert.equal(sportCatItem({ cat: "nl", kop: AI, bronnen: [{ href }] }), null);
  assert.equal(sportCatItem({ cat: "nl", kop: "Sneijder verrast publiek", bronnen: [{ href: "https://www.telegraaf.nl/video/x/1", ft: "Wesley Sneijder verrast publiek bij concert" }] }), null);
  // bestaande sportrubriek blijft staan, ook als de AI-kop geen sportwoord heeft
  assert.equal(sportCatItem({ cat: "voetbal", kop: AI, bronnen: [{ href }] }), null);
  const i: any = { cat: "voetbal", kop: AI, bronnen: [{ href }] };
  i.cat = sportCatItem(i) || i.cat;
  assert.equal(i.cat, "voetbal");
});

t("slim haalt ft uit de respons", async () => {
  const { slim } = await import("../functions/data.json");
  const r = slim({ items: [{ kop: "x", bronnen: [{ site: "A", href: "h", ft: "t" }] }] });
  assert.deepEqual(r.items[0].bronnen, [{ site: "A", href: "h" }]);
});
console.log(`${n} tests ok`);
