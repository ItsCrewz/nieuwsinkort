import assert from "node:assert/strict";
import { showCat, herindeelShow } from "../worker/src/showcat";
import { herindeelSport } from "../worker/src/sportcat";
const links = [
  "https://www.rtl.nl/boulevard/artikel/5661954/wilfred-genee-teleurgesteld-jaimie-vaes-na-interview",
  "https://www.rtl.nl/boulevard/artikel/5661932/nellie-benner-ziet-op-tegen-gemis-gezin-tijdens-serious-request",
  "https://www.nu.nl/achterklap/6414919/halle-berry-verliest-voogdij-over-zoon-voorlopig-aan-haar-ex-man.html",
  "https://www.nu.nl/muziek/6414897/claude-brengt-persoonlijkste-single-ooit-uit-muziek-als-uitlaatklep-en-dagboek.html",
  "https://www.ad.nl/show/noor-omrani-vreest-nooit-meer-de-liefde-te-vinden-na-breuk-met-oud-feyenoorder-komt-dat-door-mij~a4354ddd/",
  "https://www.telegraaf.nl/entertainment/sterren/davina-michelle-stapt-in-huwelijksbootje-met-grote-liefde-sebastiaan-we-gaan-trouwen/163836450.html",
];
for (const href of links) {
  assert.equal(showCat({ cat: "nl", items: [{ cat: "nl", href }] }), "showbizz", href);
  assert.equal(showCat({ cat: "buitenland", items: [{ href }] }), "showbizz", href);
}
const ex = (cat: string, hrefs: string[]) => ({ cat, c: hrefs.map((href) => ({ href, cat: "nl" })) });
const nieuws = ex("nl", ["https://www.nu.nl/binnenland/6414000/kabinet.html", "https://www.rtl.nl/nieuws/politiek/artikel/1/x"]);
herindeelShow(nieuws);
assert.equal(nieuws.cat, "nl");
// minder dan de helft showbizz: blijft staan; precies de helft: showbizz
assert.equal(showCat({ cat: "nl", items: [{ href: links[0] }, { href: "https://www.nu.nl/economie/1/x.html" }, { href: "https://nos.nl/artikel/1" }] }), null);
assert.equal(showCat({ cat: "nl", items: [{ href: links[0] }, { href: "https://nos.nl/artikel/1" }] }), "showbizz");
assert.equal(showCat({ cat: "nl", items: [{ cat: "showbizz", href: "https://voorbeeld.nl/a" }] }), "showbizz");
assert.equal(showCat({ cat: "nl", items: [{ href: "https://www.linda.nl/recept/x" }] }), "showbizz");
assert.equal(showCat({ cat: "nl", items: [] }), null);
// politiek, tech en sportrubrieken blijven staan; sport gaat voor
assert.equal(showCat({ cat: "politiek", items: [{ href: links[0] }] }), null);
assert.equal(showCat({ cat: "f1", items: [{ href: links[0] }] }), null);
const sport = { cat: "nl", c: [{ t: "Verstappen wint GP van Mexico", href: "https://www.nu.nl/entertainment/1/verstappen.html" }] };
herindeelSport(sport);
herindeelShow(sport);
assert.equal(sport.cat, "f1");
const voetbal = { cat: "nl", c: [{ t: "Ajax wint", href: "https://www.nu.nl/voetbal/1/ajax.html" }] };
herindeelSport(voetbal);
herindeelShow(voetbal);
assert.equal(voetbal.cat, "voetbal");
console.log("✓ showcat");
