// Draai: npm run test  (rubriekindeling Nederland / Buitenland, src/regio.ts)
import assert from "node:assert/strict";
import { bronSignaal, herindeel, isBuitenland } from "../src/regio";
import { detailInhoud, heeftLeesVerder } from "../src/leesverder";
import type { Item } from "../src/types";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
const b = (href: string, buitenFeed?: boolean) => ({ href, buitenFeed });

t("Lees verder werkt gelijk voor Nederland en Buitenland en toont de fallback", () => {
  const item: Item = { cat: "nl", kop: "Nieuws", ai: "Kort nieuws", samenvatting: "Volledige samenvatting", punten: ["Eén", "Twee", "Drie", "Vier"], tijd: "12:00", bronnen: [{ site: "Bron", href: "https://voorbeeld.nl/artikel" }] };
  assert.equal(heeftLeesVerder(item), true);
  assert.equal(heeftLeesVerder({ ...item, cat: "buitenland" }), true);
  assert.deepEqual(detailInhoud(item), { paragraphs: ["Volledige samenvatting"], punten: item.punten, bronnen: item.bronnen });
  assert.equal(heeftLeesVerder({ ...item, ai: "", samenvatting: "", punten: [] }), false);
  assert.equal(heeftLeesVerder({ ...item, ai: "", samenvatting: "", punten: [], meer: "sleutel" }), true);
});

t("NOS-link zonder sectie met buitenFeed is buitenland", () => {
  assert.equal(isBuitenland({ kop: "Storm in Florida", ai: "", bronnen: [b("https://nos.nl/l/2500001", true)] }), true);
});
t("ad.nl/buitenland/ is buitenland", () => {
  assert.equal(isBuitenland({ kop: "Brand in een fabriek", ai: "Veel gewonden.", bronnen: [b("https://www.ad.nl/buitenland/brand~a1/")] }), true);
});
t("telegraaf /binnenland/ blijft nl", () => {
  assert.equal(isBuitenland({ kop: "Ongeluk op de A2", ai: "", bronnen: [b("https://www.telegraaf.nl/nieuws/binnenland/123/ongeluk")] }), false);
});
t("cluster 2x buiten en 0 binnen is buitenland; 1 buiten en 2 binnen blijft nl", () => {
  assert.equal(isBuitenland({ kop: "Aardbeving", bronnen: [b("https://a.nl/buitenland/1"), b("https://b.nl/world/2")] }), true);
  assert.equal(isBuitenland({ kop: "Aardbeving", bronnen: [b("https://a.nl/buitenland/1"), b("https://b.nl/binnenland/2"), b("https://c.nl/regio/3")] }), false);
});
t("NL-anker wint van buitenlandse bronnen", () => {
  const it = { kop: "Zelensky op bezoek in Nederland", ai: "", bronnen: [b("https://a.nl/buitenland/1"), b("https://b.nl/buitenland/2")] };
  assert.equal(isBuitenland(it), false);
  assert.equal(herindeel({ cat: "nl", ...it }).cat, "nl");
});
t("sport (neutraal) beslist niet op landnaam", () => {
  assert.equal(isBuitenland({ kop: "Verstappen wint GP van Mexico", ai: "", bronnen: [b("https://www.nu.nl/sport/123/verstappen")] }), false);
});
t("zonder signaal beslist het woord", () => {
  assert.equal(isBuitenland({ kop: "Trump kondigt nieuwe heffingen aan", ai: "", bronnen: [b("https://x.nl/nieuws/1")] }), true);
  assert.equal(isBuitenland({ kop: "Gemeente plaatst nieuwe bankjes", ai: "", bronnen: [b("https://x.nl/nieuws/2")] }), false);
});
t("ongeldige href gooit niet", () => {
  assert.equal(bronSignaal(b("geen url")), null);
  assert.equal(bronSignaal(b("")), null);
  assert.equal(isBuitenland({ kop: "Trump", bronnen: [b("/relatief/pad")] }), true);
  assert.equal(isBuitenland({}), false);
});
t("bronSignaal: buitenFeed, buiten, binnen, neutraal, geen", () => {
  assert.equal(bronSignaal(b("https://nos.nl/l/1", true)), "buiten");
  assert.equal(bronSignaal(b("https://nrc.nl/nieuws/2026/verkiezingen-vs/x")), "buiten");
  assert.equal(bronSignaal(b("https://nu.nl/politiek/1/x")), "binnen");
  assert.equal(bronSignaal(b("https://nu.nl/voetbal/1/x")), "neutraal");
  assert.equal(bronSignaal(b("https://nu.nl/economie/1/x")), null);
});
t("bronSignaal: slug-substring geeft geen signaal, alleen een heel padsegment", () => {
  assert.equal(bronSignaal(b("https://www.ad.nl/binnenland/nederland-groeit-door-buitenlandse-migratie~a1/")), "binnen");
  assert.equal(bronSignaal(b("https://www.telegraaf.nl/financieel/wereldwijde-chiptekort/1.html")), null);
  assert.equal(bronSignaal(b("https://x.nl/nieuws/nederland-groeit-snel/1")), null);
  assert.equal(bronSignaal(b("https://x.nl/nieuws/sportief-succes/1")), null);
  assert.equal(bronSignaal(b("https://www.nu.nl/verkiezingen-vs/6/x.html")), "buiten");
  assert.equal(bronSignaal(b("https://www.nu.nl/midden-oosten/6/x.html")), "buiten");
  assert.equal(bronSignaal(b("https://x.nl/spanningen-oekraine/1")), "buiten");
  assert.equal(bronSignaal(b("https://x.nl/oorlog-in-oekraine/1")), "buiten");
  assert.equal(bronSignaal(b("https://x.nl/nederland/1")), null);
  assert.equal(bronSignaal(b("https://x.nl/podcast/1")), null);
});
t("podcast zegt niets over land: de woordenlijst beslist", () => {
  const bron = [b("https://www.telegraaf.nl/podcast/123/republikeinen-in-paniek")];
  assert.equal(isBuitenland({ kop: "Republikeinen vrezen verlies", ai: "", bronnen: bron }), true);
  assert.equal(isBuitenland({ kop: "Gemeente plaatst bankjes", ai: "", bronnen: bron }), false);
});
t("BUITEN_WOORD: nieuwe eigennamen, hoofdlettergevoelig, ë-eindes", () => {
  for (const kop of ["Likoed van Netanyahu wint", "Australische vrouw vast", "Noord-Korea test raket", "Kim Jong-un wil drones", "Documenten in Servië", "Servische premier treedt af", "Egyptische president op bezoek", "Pakistaanse legerleider", "Aziatische beurzen dalen", "Democraten zoeken kiezers", "Kremlin reageert", "Hamas laat gijzelaars vrij", "Hezbollah beschoten", "Houthi-rebellen vallen aan", "Verkiezingen in België"]) {
    assert.equal(isBuitenland({ kop, bronnen: [b("https://x.nl/nieuws/1")] }), true, kop);
  }
  for (const kop of ["Service van NS verbetert", "Azijn terug in de schappen", "De democraten in de raad", "NAVO-top in Den Haag", "Zonder landnaam"]) {
    assert.equal(isBuitenland({ kop, bronnen: [b("https://x.nl/nieuws/1")] }), false, kop);
  }
});
t("buitenlandse economie zonder landnaam en Nederlandse uitzonderingen", () => {
  for (const kop of ["Binance krijgt boete voor cryptohandel", "Wall Street sluit met winst", "Aziatische beurzen dalen"]) {
    assert.equal(herindeel({ cat: "nl", kop }).cat, "buitenland", kop);
  }
  assert.equal(isBuitenland({ kop: "Nederland onderzoekt cryptohandel bij Binance" }), false);
  assert.equal(isBuitenland({ kop: "Binance sponsort film" }), false);
  assert.equal(isBuitenland({ kop: "Binance krijgt boete", bronnen: [b("https://x.nl/binnenland/1")] }), false);
  assert.equal(herindeel({ cat: "tech", kop: "Elon Musk maakt AI-film" }).cat, "tech");
  assert.equal(herindeel({ cat: "showbizz", kop: "Elon Musk maakt AI-film" }).cat, "showbizz");
});
t("herindeel raakt alleen nl aan", () => {
  for (const cat of ["tech", "haarlem", "politiek", "showbizz"]) {
    const it = { cat, kop: "Trump en Poetin", ai: "", bronnen: [b("https://x.nl/buitenland/1", true)] };
    assert.equal(herindeel(it), it);
  }
  const nl = { cat: "nl", kop: "Trump en Poetin", ai: "", bronnen: [b("https://x.nl/buitenland/1")] };
  assert.equal(herindeel(nl).cat, "buitenland");
  assert.equal(nl.cat, "nl");
});

// Florida-privéjet (#476): RTL-pad zonder sectie, de landaanduiding staat in kop én omschrijving
const FL_HREF = "https://www.rtl.nl/nieuws/artikel/5662394/negen-doden-bij-crash-privejet-woonwijk-florida-ontploft-verenigde-staten";
const FL_OMS = "Bij een vliegtuigcrash in een woonwijk in de Amerikaanse staat Florida zijn vandaag alle negen inzittenden om het leven gekomen.";
t("Florida-item (kop, ai en omschrijving) is buitenland", () => {
  assert.equal(isBuitenland({ kop: "Privéjet crash in Florida", ai: "Privéjet crash in Florida", omschrijving: FL_OMS, bronnen: [b(FL_HREF)] }), true);
  assert.equal(herindeel({ cat: "nl", kop: "Privéjet crash in Florida", ai: "", omschrijving: FL_OMS, bronnen: [b(FL_HREF)] }).cat, "buitenland");
});
t("alleen de omschrijving noemt de Amerikaanse staat: buitenland", () => {
  assert.equal(isBuitenland({ kop: "Negen doden bij crash privéjet", ai: "Toestel ontploft naast drukke weg.", omschrijving: FL_OMS, bronnen: [b(FL_HREF)] }), true);
  assert.equal(isBuitenland({ kop: "Grote brand in woonwijk", ai: "", omschrijving: "De brand woedt in Texas en in Californië.", bronnen: [b("https://x.nl/nieuws/1")] }), true);
});
t("NL-bericht met terloopse buitenlandse vermelding in de omschrijving blijft nl", () => {
  const h = [b("https://x.nl/nieuws/1")];
  assert.equal(isBuitenland({ kop: "Bedrijf gekocht", ai: "", omschrijving: "Een Amerikaanse investeerder koopt het Nederlandse bedrijf.", bronnen: h }), false);
  assert.equal(isBuitenland({ kop: "Fabriek sluit", ai: "", omschrijving: "De fabriek exporteert naar Duitsland en Florida; het hoofdkantoor staat in Utrecht.", bronnen: h }), false);
  assert.equal(isBuitenland({ kop: "Fabriek sluit", ai: "", omschrijving: "De fabriek exporteert veel naar Duitsland en China.", bronnen: h }), false);
  assert.equal(isBuitenland({ kop: "Jetten bezoekt Florida", ai: "", omschrijving: "In Miami spreekt hij met investeerders.", bronnen: h }), false);
});
t("omschrijving telt niet bij een binnenland-, sport- of entertainmentsignaal", () => {
  assert.equal(isBuitenland({ kop: "Bedrijf gekocht", omschrijving: FL_OMS, bronnen: [b("https://x.nl/binnenland/1")] }), false);
  assert.equal(isBuitenland({ kop: "Wedstrijd afgelast", omschrijving: "Het duel zou in Miami zijn.", bronnen: [b("https://x.nl/sport/1")] }), false);
});
t("Gaza, Kyiv en andere steden in de omschrijving alleen: Nederlands nieuws blijft nl (review #477)", () => {
  const h = [b("https://x.nl/nieuws/1")];
  assert.equal(isBuitenland({ kop: "Studenten bezetten universiteitsgebouw in Leiden", ai: "", omschrijving: "Ze protesteren tegen de oorlog in Gaza.", bronnen: h }), false);
  assert.equal(isBuitenland({ kop: "Vluchtelingen vinden onderdak in sporthal Zwolle", ai: "", omschrijving: "De meeste komen uit Kyiv.", bronnen: h }), false);
  for (const stad of ["Moskou", "Jeruzalem", "Teheran", "Beiroet", "Bagdad", "Kaboel", "Parijs", "Berlijn", "Peking", "Tokio"]) assert.equal(isBuitenland({ kop: "Kamerlid reageert", ai: "", omschrijving: `Het nieuws komt uit ${stad}.`, bronnen: h }), false, stad);
});
t("dubbelzinnige stadsnamen in de kop: Chicago, Parijs, Berlijn en Las Vegas zijn geen buitenlandsignaal", () => {
  const h = [b("https://x.nl/nieuws/1")];
  assert.equal(isBuitenland({ kop: "Musical Chicago keert terug in Carré", bronnen: h }), false);
  assert.equal(isBuitenland({ kop: "Café Berlijn in Den Bosch dicht", bronnen: h }), false);
  assert.equal(isBuitenland({ kop: "Tilburgse kunstenaar exposeert in Parijs", bronnen: h }), false);
  assert.equal(isBuitenland({ kop: "Show Las Vegas in Efteling", bronnen: h }), false);
  assert.equal(isBuitenland({ kop: "Minderjarige opgepakt voor terreurdreiging in Moskou", bronnen: h }), true);
});
t("Texel is geen Texas", () => {
  assert.equal(isBuitenland({ kop: "Veerdienst naar Texel valt uit", bronnen: [b("https://x.nl/nieuws/1")] }), false);
  assert.equal(isBuitenland({ kop: "Texas wil strengere wapenwet", bronnen: [b("https://x.nl/nieuws/1")] }), true);
});

console.log(`\n${n} tests geslaagd`);
