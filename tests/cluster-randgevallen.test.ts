// Draai: npm run test  (randgevallen clusteren, worker/src/cluster.ts; issue #199). Legt huidig gedrag vast.
import assert from "node:assert/strict";
import { cluster, gelijk, normLink, sim, toks, type Cand, type Lid } from "../worker/src/cluster";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
const lid = (kop: string, s = ""): Lid => { const tok = toks(kop); return { tok, tokS: new Set([...tok, ...toks(s.slice(0, 300))]) }; };
const zelfde = (a: string, b: string) => gelijk(lid(a), lid(b)) > 0;
// vaste tijdstempels: 30 oktober 2026 12:00 UTC plus i minuten
const T0 = 1793361600000;
const c = (i: number, site: string, kop: string, cat = "nl"): Cand => ({ cat, site, href: `https://www.${site}.nl/artikel/${i}?utm=rss`, t: kop, s: "", d: T0 + i * 60000 });

// --- acroniemen van 2 letters ---

t("acroniemen: alleen hoofdletters van precies 2 letters in gemengde tekst, stopwoorden niet", () => {
  assert.ok(toks("EU en VS sluiten AI-akkoord").has("eu"));
  assert.ok(toks("EU en VS sluiten AI-akkoord").has("ai"));
  assert.ok(!toks("EUR stijgt tegenover dollar").has("eu"));
  assert.ok(!toks("EU SLUIT AKKOORD MET VS").has("eu"));
  assert.ok(!toks("Kabinet zet IN op wonen").has("in"));
});

t("acroniem telt niet mee voor Jaccard in de korte regel (n>=2, j>=0,45)", () => {
  const a = "EU akkoord migratie Brussel", b = "EU akkoord migratie Spanje Italië";
  assert.ok(sim(toks(a), toks(b)).j >= 0.45, "met acroniem zou de korte regel halen");
  assert.equal(zelfde(a, b), false);
  // zonder het extra titelwoord wel: Jaccard over lange woorden 2/4
  assert.equal(zelfde("EU akkoord migratie Brussel", "EU akkoord migratie Spanje"), true);
});

t("acroniem telt wel mee in de ruime regel (n>=4, j>=0,3)", () => {
  const a = "EU akkoord migratie asiel Brussel", b = "EU akkoord migratie asiel Spanje Italië Griekenland";
  assert.equal(zelfde(a, b), true);
  assert.equal(zelfde(a.replace("EU ", ""), b.replace("EU ", "")), false);
});

t("acroniemen zijn geen eigen woord: alleen gedeelde acroniemen plus ALGEMEEN is geen match", () => {
  assert.equal(zelfde("EU en VS: kabinet minister motie", "EU en VS: kabinet minister motie"), false);
});

// --- jaartallen en postcodedelen ---

t("jaartal telt niet als eigen woord", () => {
  assert.equal(zelfde("Begroting 2026 Zandvoort", "Begroting 2026 Bloemendaal"), false);
  // met een gewoon woord op die plek wel
  assert.equal(zelfde("Begroting tekort Zandvoort", "Begroting tekort Bloemendaal"), true);
});

t("postcodedeel (4 cijfers) telt niet als eigen woord, ook niet bij gelijke titels", () => {
  assert.equal(zelfde("Omgevingsvergunning Kerkweg 2011 AB", "Omgevingsvergunning Kerkweg 2011 AB"), false);
  assert.equal(zelfde("Omgevingsvergunning Kerkweg Dorpsplein 2011 AB", "Omgevingsvergunning Kerkweg Dorpsplein 2011 AB"), true);
});

t("getallen van 5 of meer cijfers tellen wel als eigen woord", () => {
  assert.equal(zelfde("Loterij 12345 Zandvoort", "Loterij 12345 Bloemendaal"), true);
});

// --- ALGEMEEN ---

t("alleen woorden uit ALGEMEEN is geen match, ook bij hoge Jaccard", () => {
  const a = "Tweede Kamer steunt motie kabinet", b = "Tweede Kamer verwerpt motie kabinet";
  assert.ok(sim(toks(a), toks(b)).j >= 0.6);
  assert.equal(zelfde(a, b), false);
  assert.equal(zelfde("Nederlandse politie onderzoek Haarlem", "Nederlands politie-onderzoek in Haarlem"), false);
});

t("ALGEMEEN plus één eigen woord is niet genoeg; met twee eigen woorden wel", () => {
  assert.equal(zelfde("Tweede Kamer motie stikstof aangenomen", "Tweede Kamer motie stikstof verworpen"), false);
  assert.equal(zelfde("Tweede Kamer motie stikstof boeren aangenomen", "Tweede Kamer motie stikstof boeren verworpen"), true);
});

// --- samenvoegen van clusters ---

t("kandidaat die bij twee clusters past voegt ze samen in het oudste", () => {
  const A = c(1, "nos", "Brand verwoest boerderij Zeeland Kapelle");
  const B = c(2, "omroepzeeland", "Honderd koeien gered brandweer Middelburg");
  const C = c(3, "pzc", "Brand verwoest boerderij Zeeland honderd koeien gered brandweer");
  assert.equal(zelfde(A.t, B.t), false);
  assert.equal(cluster([A, B]).length, 2);
  const uit = cluster([C, B, A]);
  assert.equal(uit.length, 1);
  assert.deepEqual(uit[0].c.map((x) => x.site), ["nos", "omroepzeeland", "pzc"]);
  assert.equal(uit[0].key, normLink(A.href));
  assert.equal(uit[0].leden.length, 3);
  for (const w of ["kapell", "middelburg", "koei"]) assert.ok(uit[0].tok.has(w), w);
});

t("samenvoegen laat een los cluster ernaast staan", () => {
  const A = c(1, "nos", "Brand verwoest boerderij Zeeland Kapelle");
  const D = c(2, "nu", "Treinverkeer Utrecht urenlang plat door storing");
  const B = c(3, "omroepzeeland", "Honderd koeien gered brandweer Middelburg");
  const C = c(4, "pzc", "Brand verwoest boerderij Zeeland honderd koeien gered brandweer");
  const uit = cluster([A, D, B, C]);
  assert.equal(uit.length, 2);
  assert.deepEqual(uit.map((k) => k.c.length).sort(), [1, 3]);
  assert.equal(uit.find((k) => k.c.length === 1)!.c[0].site, "nu");
});

// --- vergelijking per lid, niet met de unie ---

t("kandidaat vergelijkt per clusterlid (max), niet met de unie van de tokens", () => {
  const A = c(1, "nos", "Stroomstoring treft centrum Utrecht");
  const B = c(2, "ad", "Stroomstoring treft centrum Utrecht duizenden huishoudens urenlang zonder elektriciteit");
  const Z = c(3, "nu", "Stroomstoring centrum Utrecht");
  assert.equal(zelfde(A.t, B.t), true);
  assert.equal(zelfde(Z.t, A.t), true);
  assert.equal(zelfde(Z.t, B.t), false);
  const [ab] = cluster([A, B]);
  assert.equal(gelijk(lid(Z.t), { tok: ab.tok, tokS: ab.tokS }), 0, "tegen de unie geen match");
  const uit = cluster([A, B, Z]);
  assert.equal(uit.length, 1);
  assert.equal(uit[0].c.length, 3);
});

console.log(`\n${n} tests geslaagd`);
