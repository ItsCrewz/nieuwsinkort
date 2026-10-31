// Sport uit algemene feeds (#425): samenstellingen, motorsport en de herindeling na de AI-stap.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { herindeelSport, sportCat, sportCatItem } from "../worker/src/sportcat";

let n = 0;
const t = (naam: string, fn: () => void) => { fn(); n++; console.log("✓", naam); };
const check = (kop: string, hrefs: string[] = [], cat = "nl") => sportCat({ cat, kop, hrefs });

t("voetbalsamenstellingen en motorsport", () => {
  assert.equal(check("Discussie over voetballer Owen Wijndal", ["https://www.telegraaf.nl/video/pittige-discussie-over-owan-wijndal-een-grote-pr-machine/1"]), "voetbal");
  assert.equal(check("Amateurvoetballer scoort prachtig doelpunt"), "voetbal");
  assert.equal(check("Jorge Martin vreest verlies wereldtitel", ["https://www.telegraaf.nl/sport/motogp/x", "https://www.rtl.nl/nieuws/sport/artikel/1/coureur-martin"]), "auto");
  assert.equal(check("Martin somber", ["https://www.rtl.nl/nieuws/sport/artikel/1/x"]), "sport");
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

t("live-kopie 31-10: alleen echte sportitems verhuizen (sport / voetbal / auto)", () => {
  const items: { kop: string; hrefs: string[] }[] = JSON.parse(readFileSync("tests/fixtures/live-nl-31-10.json", "utf8"));
  const verhuisd = items.filter((i) => sportCat({ cat: "nl", kop: i.kop, hrefs: i.hrefs })).map((i) => i.kop).sort();
  assert.deepEqual(verhuisd, ["Amateurvoetballer scoort prachtig doelpunt", "Discussie over voetballer Owen Wijndal", "Jarno Meijer is nieuwe KNSB-baas", "Jorge Martin vreest verlies wereldtitel"]);
});

t("herindeling na de AI-stap: AI-kop en bestaande nl-items", () => {
  // Feedtitel zonder signaal, AI-kop met "voetballer": zoals in index.ts na de AI-stap
  const hrefs = ["https://www.telegraaf.nl/video/x/1"];
  assert.equal(check("Pittige discussie over Owen Wijndal", hrefs), null);
  const items = [{ cat: "nl", kop: "Discussie over voetballer Owen Wijndal", bronnen: hrefs.map((href) => ({ href })) }, { cat: "politiek", kop: "Voetballer in Kamer", bronnen: [] }];
  for (const i of items) i.cat = sportCat({ cat: i.cat, kop: i.kop, hrefs: i.bronnen.map((b) => b.href) }) || i.cat;
  assert.deepEqual(items.map((i) => i.cat), ["voetbal", "politiek"]);
});

t("feedtitel en -beschrijving i.p.v. AI-kop (#433)", () => {
  // Echt Telegraaf-item van 31-10 (RSS /rss/, categorie Video): de titel bevat geen voetbalwoord, de beschrijving wel
  const xml = readFileSync("tests/fixtures/tg-wijndal-item.xml", "utf8");
  const ft = /<title><!\[CDATA\[(.*?)\]\]>/.exec(xml)![1];
  const fd = /<description><!\[CDATA\[(.*?)\]\]>/.exec(xml)![1];
  const href = /<link>(.*?)<\/link>/.exec(xml)![1];
  assert.equal(ft, "Pittige discussie over Owen Wijndal: 'Een grote PR-machine!'");
  const AI = "Mike Verweij en Valentijn Driessen discussiëren over Owen Wijndal";
  assert.equal(sportCatItem({ cat: "nl", kop: AI, bronnen: [{ href, ft }] }), null);
  assert.equal(sportCatItem({ cat: "nl", kop: AI, bronnen: [{ href, ft, fd }] }), "voetbal");
  // item uit een eerdere run: zelfde pad via opgeslagen bronnen
  const eerder = JSON.parse(JSON.stringify({ cat: "nl", kop: AI, bronnen: [{ site: "Telegraaf", href, ft, fd: fd.slice(0, 300) }] }));
  eerder.cat = sportCatItem(eerder) || eerder.cat;
  assert.equal(eerder.cat, "voetbal");
  // vers uit de feed (herindeelSport, beschrijving = c.s)
  const k = { cat: "nl", c: [{ t: ft, href, s: fd }] };
  herindeelSport(k);
  assert.equal(k.cat, "voetbal");
  assert.equal(sportCatItem({ cat: "nl", kop: AI, bronnen: [{ href }] }), null);
  const nl = (ft: string, fd: string) => sportCatItem({ cat: "nl", kop: ft, bronnen: [{ href: "https://www.telegraaf.nl/video/x/1", ft, fd }] });
  assert.equal(nl("Wesley Sneijder verrast publiek bij concert", "Sneijder trad op in Ahoy voor een uitverkocht huis."), null);
  assert.equal(nl("Interview met trainer", "Het gesprek ging over Ajax."), null);
  assert.equal(nl("Interview met trainer", "Oranje staat voor een zware opgave."), null);
  assert.equal(nl("Interview met trainer", "Na de wedstrijd was er veel te doen."), null);
  assert.equal(nl("Sneijder verrast publiek", "De oud-voetballer trad op in Ahoy."), null);
  assert.equal(nl("Nieuws", "Max Verstappen won de Grand Prix."), null);
  assert.equal(nl("Nieuws", "De Eredivisie-wedstrijd werd uitgesteld."), "voetbal");
  // bestaande sportrubriek blijft staan, ook als de AI-kop geen sportwoord heeft
  assert.equal(sportCatItem({ cat: "voetbal", kop: AI, bronnen: [{ href }] }), null);
});

t("slim haalt ft uit de respons", async () => {
  const { slim } = await import("../functions/data.json");
  const r = slim({ items: [{ kop: "x", bronnen: [{ site: "A", href: "h", ft: "t", fd: "d" }] }] });
  assert.deepEqual(r.items[0].bronnen, [{ site: "A", href: "h" }]);
});
t("overige sport wordt rubriek Sport (#435)", () => {
  for (const kop of ["Kjeld Nuis wint 1.500 meter in Thialf", "Fallon Sherrock wint prijzenpot dartsshow", "Tadej Pogačar brak drie wervels", "Wielrenner valt in Tour de France", "Griekspoor wint tennistoernooi", "Hockeysters winnen van Duitsland", "Schaatsers pakken goud op het WK"]) assert.equal(check(kop, ["https://www.nu.nl/x/1"]), "sport", kop);
  assert.equal(check("Dartsster wint", ["https://www.nu.nl/darts/1"]), "sport");
  assert.equal(check("Uitslag", ["https://www.nu.nl/schaatsen/6/x.html"]), "sport");
  assert.equal(check("Stephen Curry scoort", ["https://nos.nl/sport/1"], "buitenland"), "sport");
  assert.equal(sportCatItem({ cat: "nl", kop: "Nieuws", bronnen: [{ href: "https://www.nu.nl/x/1", ft: "Wielrenner breekt sleutelbeen" }] }), "sport");
  assert.equal(sportCatItem({ cat: "nl", kop: "Nieuws", bronnen: [{ href: "https://www.nu.nl/x/1", ft: "Nieuws", fd: "De darter won het toernooi." }] }), "sport");
});

t("voetbal, F1 en auto gaan voor sport; bestaande sport blijft", () => {
  assert.equal(check("Voetballer en tennisser samen", ["https://www.nu.nl/sport/1"]), "voetbal");
  assert.equal(check("Verstappen en schaatser Nuis", ["https://www.nu.nl/sport/1"]), "f1");
  assert.equal(check("MotoGP-coureur en wielrenner", ["https://www.nu.nl/sport/1"]), "auto");
  assert.equal(sportCat({ cat: "sport", kop: "Mika Godts scoort", hrefs: ["https://www.nu.nl/voetbal/1"] }), "voetbal");
  assert.equal(sportCat({ cat: "sport", kop: "Nieuws", hrefs: [] }), null);
  assert.equal(sportCat({ cat: "voetbal", kop: "Wielrenner wint", hrefs: [] }), null);
});

t("gewoon nieuws en schaatsen buiten sportcontext blijven Nederland", () => {
  for (const kop of ["Schaatsen op natuurijs: ijsmeesters waarschuwen voor dunne plekken", "Weer: dooi maakt schaatsen onmogelijk", "Code oranje: gladheid door vorst, schaatsers gewaarschuwd", "Kabinet bereikt akkoord over begroting", "Man neergeschoten in Rotterdam", "NASA Dart-missie geslaagd", "Tennisarm behandelen met fysio"]) assert.equal(check(kop, ["https://www.nu.nl/binnenland/1"]), null, kop);
  assert.equal(check("Nieuws", ["https://www.nu.nl/sporthal-opent/1"]), null);
});
t("buitenlandse clubs zijn voetbal, nooit Sport (#435)", () => {
  const sp = ["https://www.nu.nl/sport/1"];
  assert.equal(check("Atlético Madrid pakt koppositie na winst bij Levante", sp), "voetbal");
  assert.equal(check("Chelsea wint met 2-0 van Manchester United op Stamford Bridge", sp), "voetbal");
  assert.equal(check("Chelsea wint met 2-0", []), "voetbal");
  assert.equal(check("Chelsea bouwt nieuwe flat in Rotterdam"), null);
  assert.equal(check("Weekendje Barcelona of Madrid", ["https://www.nu.nl/reizen/1"]), null);
});

t("afstanden, weer en dubbelzinnige woorden", () => {
  assert.equal(check("Nuis wint 1.500 meter na griep"), "sport");
  assert.equal(check("Zwemmers gered uit zee bij Scheveningen"), null);
  assert.equal(check("Tina Turner-musical in Amsterdam"), null);
  assert.equal(check("Zwemmer wint goud op WK"), "sport");
  assert.equal(check("Zwemmers pakken medaille op WK"), "sport");
  assert.equal(check("Kjeld Nuis schaatst weer mee"), "sport");
  assert.equal(check("Kan er volgende week geschaatst worden op natuurijs?"), null);
  assert.equal(check("Schaatsen op natuurijs kan, zegt weerbericht"), null);
  assert.equal(check("Fietser gewond bij aanrijding"), null);
  assert.equal(check("Kabinet bereikt akkoord", ["https://www.nu.nl/politiek/1"]), null);
  assert.equal(check("Politie arresteert twee verdachten", ["https://www.nu.nl/binnenland/1"]), null);
});

t("autobron gaat niet naar Sport", () => {
  assert.equal(check("Nieuwe sponsor voor Tour de France", [], "auto"), null);
  assert.equal(check("Nieuwe sponsor voor Tour de France", ["https://www.autoweek.nl/sport/x"], "auto"), null);
  assert.equal(check("Chelsea wint met 2-0 van Manchester United", [], "auto"), "voetbal");
  assert.equal(check("Wielrenner wint", [], "sport"), "sport");
});
console.log(`${n} tests ok`);
