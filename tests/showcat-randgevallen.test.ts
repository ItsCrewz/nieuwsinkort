import assert from "node:assert/strict";
import { showCat, herindeelShow, nietAlsNieuws, isShowLink, MISDAAD, SOCIAL_URL } from "../worker/src/showcat";
import { herindeelSport } from "../worker/src/sportcat";

const show = "https://www.rtl.nl/boulevard/artikel/1/bn-er";
const show2 = "https://www.nu.nl/achterklap/2/ster.html";
const gewoon = "https://nos.nl/artikel/1";
const gewoon2 = "https://www.nu.nl/economie/3/x.html";

// Elk woord uit MISDAAD houdt een volledig showbizzcluster buiten Showbizz (#110, #149)
const misdaad = [
  "politie", "opsporing", "OM", "openbaar ministerie", "rechtbank", "rechter", "officier van justitie",
  "aangehouden", "aanhouding", "arrestatie", "gearresteerd", "verdacht", "verdachte", "verdachten",
  "liquidatie", "liquidaties", "crimineel", "criminele", "criminelen", "misdaad", "misdaadjournalist",
  "moord", "moordzaak", "doodgeschoten", "schietpartij", "drugs", "drugsbende", "witwassen", "witwaspraktijken",
  "veroordeeld", "celstraf", "gevangenisstraf", "opgepakt",
];
for (const w of misdaad) {
  const kop = `BN'er en ${w} in het nieuws`;
  assert.ok(MISDAAD.test(kop), w);
  assert.equal(showCat({ cat: "nl", items: [{ href: show }, { cat: "showbizz", href: show2 }], kop }), null, w);
  assert.equal(showCat({ cat: "buitenland", items: [{ href: show }], kop: kop.toUpperCase() }), null, `${w} (hoofdletters)`);
  const inTitel = { cat: "nl", c: [{ href: show, cat: "showbizz", t: kop }, { href: show2 }] };
  herindeelShow(inTitel);
  assert.equal(inTitel.cat, "nl", `${w} in titel`);
  const inSamenvatting = { cat: "buitenland", c: [{ href: show, t: "Zangeres in opspraak" }, { href: show2, s: `Volgens bronnen: ${w}.` }] };
  herindeelShow(inSamenvatting);
  assert.equal(inSamenvatting.cat, "buitenland", `${w} in samenvatting`);
}
// Heel woord: afleidingen zonder \w*-staart tellen niet
for (const kop of ["Politieke satire van cabaretier", "Rechterlijke kleding op de rode loper", "Moderne roman", "Romeo en Julia in Carré"]) {
  assert.equal(MISDAAD.test(kop), false, kop);
  assert.equal(showCat({ cat: "nl", items: [{ href: show }], kop }), "showbizz", kop);
}
// Huidig gedrag: "om" telt hoofdletterongevoelig, ook als gewoon voorzetsel
assert.equal(showCat({ cat: "nl", items: [{ href: show }], kop: "Davina trouwt om acht uur" }), null);

// Sport gaat voor: na herindeelSport is de rubriek geen nl/buitenland meer
const f1 = { cat: "buitenland", c: [{ t: "Verstappen op de rode loper", href: show }, { t: "Max en Kelly", href: show2 }] };
herindeelSport(f1);
herindeelShow(f1);
assert.equal(f1.cat, "f1");
const voetbal = { cat: "nl", c: [{ t: "Feyenoorder krijgt relatie", href: show }, { t: "Ex-speler van Feyenoord", href: show2 }] };
herindeelSport(voetbal);
herindeelShow(voetbal);
assert.equal(voetbal.cat, "voetbal");
for (const cat of ["f1", "voetbal", "auto", "tech", "haarlem", "showbizz"]) {
  assert.equal(showCat({ cat, items: [{ cat: "showbizz", href: show }] }), null, cat);
}

// Politiek blijft politiek, ook met alleen showbizzkandidaten
assert.equal(showCat({ cat: "politiek", items: [{ href: show }, { cat: "showbizz", href: show2 }] }), null);
const pol = { cat: "politiek", c: [{ href: show, cat: "showbizz", t: "Minister bij talkshow" }] };
herindeelShow(pol);
assert.equal(pol.cat, "politiek");

// Precies de helft telt wel, minder dan de helft niet
const items = (n: number, totaal: number) => Array.from({ length: totaal }, (_, i) => ({ href: i < n ? show : gewoon }));
assert.equal(showCat({ cat: "nl", items: items(1, 2) }), "showbizz");
assert.equal(showCat({ cat: "nl", items: items(2, 4) }), "showbizz");
assert.equal(showCat({ cat: "buitenland", items: items(3, 6) }), "showbizz");
assert.equal(showCat({ cat: "nl", items: items(3, 4) }), "showbizz");
assert.equal(showCat({ cat: "nl", items: items(1, 3) }), null);
assert.equal(showCat({ cat: "nl", items: items(2, 5) }), null);
assert.equal(showCat({ cat: "buitenland", items: items(3, 7) }), null);
assert.equal(showCat({ cat: "nl", items: items(0, 1) }), null);
// Showbizzfeed en showbizzpad tellen samen, één item met beide telt één keer
assert.equal(showCat({ cat: "nl", items: [{ cat: "showbizz", href: gewoon }, { href: show }, { href: gewoon2 }, { href: gewoon }] }), "showbizz");
assert.equal(showCat({ cat: "nl", items: [{ cat: "showbizz", href: show }, { href: gewoon2 }, { href: gewoon }] }), null);
const half = { cat: "nl", c: [{ href: show, t: "Zangeres gaat trouwen" }, { href: gewoon, t: "Zangeres gaat trouwen" }] };
herindeelShow(half);
assert.equal(half.cat, "showbizz");
const minder = { cat: "buitenland", c: [{ href: show }, { href: gewoon }, { href: gewoon2 }] };
herindeelShow(minder);
assert.equal(minder.cat, "buitenland");

// Social-feed-URL's tellen niet als nieuws, behalve bij politiek
const social = [
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCabc",
  "https://m.youtube.com/feeds/videos.xml?channel_id=UCabc",
  "https://www.instagram.com/rtlboulevard/",
  "https://www.reddit.com/r/thenetherlands/.rss",
  "https://old.reddit.com/r/Netherlands/new/.rss",
  "https://kg.meowing.de/rtlboulevard/atom.xml",
  "https://WWW.YOUTUBE.COM/feeds/videos.xml?user=x",
];
for (const url of social) {
  assert.ok(SOCIAL_URL.test(url), url);
  for (const g of ["nl", "showbizz", "buitenland", "haarlem"]) assert.equal(nietAlsNieuws(g, "", url), true, `${g} ${url}`);
  assert.equal(nietAlsNieuws("politiek", "", url), false, url);
  assert.equal(isShowLink(url), false, url);
}
for (const url of ["https://www.rtl.nl/boulevard/rss.xml", "https://feeds.nos.nl/nosnieuwsalgemeen", "https://www.linda.nl/feed/"]) {
  assert.equal(nietAlsNieuws("showbizz", "YouTube, Instagram", url), false, url);
}
// Podcast in de broninfo telt evenmin, behalve bij politiek (hoofdlettergevoelig)
assert.equal(nietAlsNieuws("nl", "NOS Podcast", "https://feeds.nos.nl/podcast"), true);
assert.equal(nietAlsNieuws("politiek", "Podcast", "https://feeds.nos.nl/podcast"), false);
assert.equal(nietAlsNieuws("nl", "podcast", "https://feeds.nos.nl/x"), false);

// isShowLink: alleen exacte host of subdomein, ongeldige URL's tellen niet
assert.equal(isShowLink("https://nieuws.rtl.nl/boulevard/x"), true);
assert.equal(isShowLink("https://www.nu.nl/Achterklap/1/x.html"), true);
assert.equal(isShowLink("https://www.notrtl.nl/boulevard/x"), false);
assert.equal(isShowLink("https://www.rtl.nl/nieuws/boulevard/x"), false);
assert.equal(isShowLink("https://linda.nl.voorbeeld.com/x"), false);
assert.equal(isShowLink("/boulevard/relatief"), false);
assert.equal(isShowLink(""), false);
console.log("✓ showcat-randgevallen");
