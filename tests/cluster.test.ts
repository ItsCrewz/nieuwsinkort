// Draai: npm run test  (clusteren van nieuwskandidaten, worker/src/cluster.ts; issue #38)
import assert from "node:assert/strict";
import { cluster, toks, type Cand } from "../worker/src/cluster";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
let d = 0;
const c = (site: string, kop: string, s = "", cat = "tech"): Cand => ({ cat, site, href: `https://${site.toLowerCase()}.nl/${++d}`, t: kop, s, d: d * 60000 });
const aantal = (...cs: Cand[]) => cluster(cs).length;

const TW = "Meerderheid van Nederlandse Kamer wil verbod op AI in het basisonderwijs";
const TW_S = "Een meerderheid van de Nederlandse Tweede Kamer wil dat scholieren in het basisonderwijs geen generatieve AI mogen gebruiken. Onder andere regeringspartij D66 en oppositiepartijen van alle kanten van het politieke spectrum hebben een motie van volt mede-ingediend.";
const SE = "Tweede Kamer wil gebruik van generatieve AI op basisscholen verbieden";
const SE_S = "De Tweede Kamer wil dat het gebruik van generatieve AI op basisscholen wordt verboden. Een motie van Volt die hiertoe oproept is door een meerderheid van de Kamer gesteund.";

const AI_VERBOD: Cand[] = [
  {
    "cat": "tech",
    "site": "Tweakers",
    "href": "https://tweakers.net/nieuws/253932/meerderheid-van-nederlandse-kamer-wil-verbod-op-ai-in-het-basisonderwijs.html",
    "t": "Meerderheid van Nederlandse Kamer wil verbod op AI in het basisonderwijs",
    "s": "Een meerderheid van de Nederlandse Tweede Kamer wil dat scholieren in het basisonderwijs geen generatieve AI mogen gebruiken. Onder andere regeringspartij D66 en oppositiepartijen van alle kanten van het politieke spectrum hebben een motie van volt mede-ingediend. De verantwoordelijke staatssecretaris wil eerst onderzoek naar het plan. Het kabinet hoeft een motie niet direct uit te voeren.",
    "d": 1793350514000
  },
  {
    "cat": "nl",
    "site": "Trouw",
    "href": "https://www.trouw.nl/binnenland/kamer-wil-ai-verbod-op-basisschool-staatssecretaris-maant-tot-kalmte~b33b0e79/",
    "t": "Kamer wil AI-verbod op basisschool, staatssecretaris maant tot kalmte",
    "s": "",
    "d": 1793294520000
  },
  {
    "cat": "tech",
    "site": "Security.nl",
    "href": "https://www.security.nl/posting/959723/Tweede+Kamer+wil+gebruik+van+generatieve+AI+op+basisscholen+verbieden?channel=rss",
    "t": "Tweede Kamer wil gebruik van generatieve AI op basisscholen verbieden",
    "s": "De Tweede Kamer wil dat het gebruik van generatieve AI op basisscholen wordt verboden. Een motie van Volt die hiertoe oproept ...",
    "d": 1793350438000
  },
  {
    "cat": "nl",
    "site": "AD",
    "href": "https://www.ad.nl/politiek/kamer-wil-verbod-op-gebruik-van-chatbots-op-basisschool-staatsecretaris-steunt-plan-nog-niet~aa023459/",
    "t": "Kamer wil verbod op gebruik van chatbots op basisschool, staatsecretaris steunt plan nog niet",
    "s": "Kinderen moeten op de basisschool leren lezen, schrijven en rekenen zonder AI-hulpmiddelen als ChatGPT, Google Gemini of Claude. Een grote meerderheid in de Tweede Kamer wil een totaalverbod op het gebruik van dergelijke generatieve AI-programma’s in het primair onderwijs. De koepelorganisatie daarvan laat weten verbaasd te zijn. Volgens een woordvoerder komt de beslissing ‘uit de lucht vallen’.",
    "d": 1793287140000
  },
  {
    "cat": "nl",
    "site": "NOS",
    "href": "https://nos.nl/l/2637170",
    "t": "Geen AI voor kinderen in het basisonderwijs, zegt Tweede Kamer",
    "s": "Het gebruik van generatieve AI in de klas moet voor kinderen in het basisonderwijs worden verboden. Een Kamermeerderheid steunt een voorstel hierover van Volt en het CDA. \"We mogen niet dezelfde fout maken als toen sociale media kritiekloos werden omarmd\", zegt Kamerlid Dassen van Volt. CDA-Kamerlid Armut: \"Generatieve AI voegt voor basisschoolleerlingen wat ons betreft niks toe.\" Generatieve AI is kunstmatige intelligentie die op basis van opdrachten zelf in staat is om tekst, audio, video of beeld te genereren, zoals bijvoorbeeld ChatGPT, Claude en Copilot. Volgens de partijen ontwikkelen jo",
    "d": 1793284241000
  },
  {
    "cat": "nl",
    "site": "RTL Nieuws",
    "href": "https://www.rtl.nl/nieuws/politiek/artikel/5661847/kamer-verbod-chatgpt-ai-verbieden-basisschool",
    "t": "Kamer wil gebruik van AI zoals chatbots verbieden voor basisschoolleerlingen",
    "s": "Basisschoolleerlingen mogen geen generatieve AI gebruiken, vindt de Tweede Kamer. Een ruime meerderheid steunt een motie van Volt en CDA die het kabinet vraagt om een verbod te regelen. Generatieve AI is kunstmatige intelligentie die bijvoorbeeld tekst, video of muziek kan maken. Chatbots als ChatGPT vallen er ook onder.",
    "d": 1793289807000
  }
];
const kopie = (l: Cand[]) => l.map((x) => ({ ...x }));

t("toks: 2-letter acroniemen tellen mee, lidwoorden en hulpwerkwoorden niet", () => {
  const k = toks("De EU wil AI verbieden in het VN-rapport");
  for (const w of ["eu", "ai", "vn", "verbod", "rapport"]) assert.ok(k.has(w), w);
  assert.ok(!k.has("de") && !k.has("het") && !k.has("wil"));
});
t("toks: stam en synoniemen", () => {
  assert.deepEqual([...toks("verbieden")], [...toks("verbod")]);
  assert.deepEqual([...toks("basisscholen")], [...toks("basisonderwijs")]);
  assert.deepEqual([...toks("gemeenten")], [...toks("gemeente")]);
});
t("toks: tekst in kapitalen levert geen acroniemen", () => {
  assert.ok(!toks("GROTE BRAND IN HAARLEM").has("in"));
  assert.equal(toks("BRAND OP DE A2").size, toks("BRAND OP DE A2").size);
});
t("#38: AI-verbod basisonderwijs (Tweakers + Security.nl) met beschrijving = 1 cluster", () => {
  assert.equal(aantal(c("Tweakers", TW, TW_S), c("Security", SE, SE_S)), 1);
});
t("#38: alleen de titels = 1 cluster", () => {
  assert.equal(aantal(c("Tweakers", TW), c("Security", SE)), 1);
});
t("zelfde verhaal, andere volgorde en rubriek-gelijk: nog steeds 1 cluster", () => {
  assert.equal(aantal(c("Security", SE), c("Tweakers", TW)), 1);
});
t("#38: alle 6 echte items (NOS, AD, RTL, Trouw, Security.nl, Tweakers) = 1 cluster, in tijdvolgorde en omgekeerd", () => {
  assert.equal(cluster(kopie(AI_VERBOD)).length, 1);
  // omgekeerde volgorde: ook de tijdstempels omdraaien, zodat cluster() ze echt omgekeerd verwerkt
  const max = Math.max(...AI_VERBOD.map((x) => x.d));
  assert.equal(cluster(AI_VERBOD.map((x) => ({ ...x, d: max - x.d }))).length, 1);
  for (const k of cluster(kopie(AI_VERBOD))) assert.equal(k.c.length, 6);
});
t("grote cluster trekt meer bronnen aan (max over leden, niet de unie)", () => {
  const extra = c("Volkskrant", "Kamer wil AI-verbod voor basisschoolleerlingen", "", "nl");
  extra.d = Math.max(...AI_VERBOD.map((x) => x.d)) + 1;
  assert.equal(cluster([...kopie(AI_VERBOD), extra]).length, 1);
});
t("negatief: ketenvorming, AI-verbod-cluster met 6 bronnen trekt ongerelateerde berichten niet aan", () => {
  const vreemd = [
    c("NOS", "Kamer wil verbod op vuurwerk", "Een meerderheid van de Tweede Kamer wil een verbod op consumentenvuurwerk. Een motie van de ChristenUnie werd gesteund.", "nl"),
    c("Tweakers", "OpenAI wil chips van Google kopen", "OpenAI wil AI-chips van Google huren voor het trainen en draaien van modellen, meldt Reuters."),
    c("NU", "Kamer wil AI-regels voor gemeenten", "De Tweede Kamer wil dat gemeenten duidelijke regels krijgen voor het gebruik van AI bij vergunningen.", "nl"),
  ];
  for (const v of vreemd) {
    v.d = Math.max(...AI_VERBOD.map((x) => x.d)) + 1000;
    const k = cluster([...kopie(AI_VERBOD), { ...v }]);
    assert.equal(k.length, 2, v.t);
  }
  assert.equal(cluster([...kopie(AI_VERBOD), ...vreemd.map((v) => ({ ...v }))]).length, 4);
});
t("negatief: A~B en B~C voegt A en C niet samen als C niet bij B past", () => {
  assert.equal(aantal(
    c("A", "Brand legt fabriek in Zaandam volledig in de as", "", "nl"),
    c("B", "Grote brand legt fabriek in Zaandam in de as", "", "nl"),
    c("C", "Zaandam krijgt nieuwe fabriek voor zonnepanelen", "", "nl")), 2);
});
t("negatief: Kamer-verbod op vuurwerk vs AI-verbod op basisscholen", () => {
  assert.equal(aantal(c("NOS", "Tweede Kamer wil verbod op vuurwerk", "Een meerderheid van de Tweede Kamer wil een verbod op consumentenvuurwerk. Een motie van de ChristenUnie werd gesteund.", "nl"), c("Security", SE, SE_S)), 2);
  assert.equal(aantal(c("NOS", "Tweede Kamer wil verbod op vuurwerk", "Een meerderheid van de Tweede Kamer wil een verbod op consumentenvuurwerk. Een motie van de ChristenUnie werd gesteund.", "nl"), c("Tweakers", TW, TW_S)), 2);
});
t("negatief: twee verschillende AI-berichten", () => {
  assert.equal(aantal(
    c("Tweakers", "OpenAI wil chips van Google kopen", "OpenAI wil AI-chips van Google huren voor het trainen en draaien van modellen, meldt Reuters."),
    c("Security", SE, SE_S)), 2);
  assert.equal(aantal(
    c("Tweakers", "OpenAI wil chips van Google kopen", "OpenAI wil AI-chips van Google huren."),
    c("Tweakers", "Google lanceert nieuwe AI-functie in Gmail", "Google brengt een AI-functie in Gmail die mails samenvat.")), 2);
});
t("negatief: verschillende Kamer-moties", () => {
  assert.equal(aantal(
    c("NOS", "Tweede Kamer wil verbod op social media voor kinderen", "Een meerderheid van de Tweede Kamer wil dat kinderen onder de vijftien geen social media mogen gebruiken. Een motie van het CDA werd aangenomen.", "nl"),
    c("NU", "Tweede Kamer wil verbod op wegwerpvapes", "Een meerderheid van de Tweede Kamer wil wegwerpvapes verbieden. Een motie van D66 werd aangenomen.", "nl")), 2);
  assert.equal(aantal(
    c("NOS", "Tweede Kamer wil onderzoek naar stikstofbeleid", "De Tweede Kamer wil een onderzoek naar het stikstofbeleid. Een motie van de BBB werd aangenomen.", "nl"),
    c("NU", "Tweede Kamer wil onderzoek naar zorgkosten", "De Tweede Kamer wil een onderzoek naar de stijgende zorgkosten. Een motie van de SP werd aangenomen.", "nl")), 2);
});
t("negatief: twee verschillende Haarlem-berichten", () => {
  assert.equal(aantal(
    c("Haarlem105", "Brand in woning aan de Kleverlaan in Haarlem", "Brandweer rukte uit voor een brand in een woning in Haarlem.", "haarlem"),
    c("Haarlem105", "Nieuwe parkeerregels in Haarlem Noord", "De gemeente Haarlem voert nieuwe parkeerregels in.", "haarlem")), 2);
  assert.equal(aantal(
    c("Haarlems Dagblad", "Haarlem sluit Kennemerlaan voor wegwerkzaamheden", "De gemeente Haarlem sluit de Kennemerlaan.", "haarlem"),
    c("Haarlem105", "Haarlem sluit zwembad Boerhaavebad wegens lekkage", "De gemeente Haarlem sluit het zwembad.", "haarlem")), 2);
});
t("negatief: EU-berichten over verschillende onderwerpen", () => {
  assert.equal(aantal(
    c("NOS", "EU legt Rusland nieuwe sancties op", "De EU heeft een nieuw sanctiepakket tegen Rusland aangenomen.", "buitenland"),
    c("NU", "EU wil strengere regels voor sociale media", "De EU wil strengere regels voor sociale media-bedrijven.", "buitenland")), 2);
  assert.equal(aantal(
    c("NOS", "EU bereikt akkoord over landbouwsubsidies", "De EU-landen bereikten een akkoord over landbouwsubsidies.", "buitenland"),
    c("NU", "EU bereikt akkoord over nieuwe klimaatdoelen", "De EU-landen bereikten een akkoord over klimaatdoelen.", "buitenland")), 2);
});
t("negatief: acroniem alleen is geen bewijs", () => {
  assert.equal(aantal(c("A", "AI neemt banen over bij banken"), c("B", "AI helpt artsen bij kankerdiagnose")), 2);
});
t("negatief: gedeelde vakwoorden (webinars, CISA-adviezen van verschillende producten)", () => {
  assert.equal(aantal(c("THN", "The Rise of the Threat Operator: How AI Will Redefine Security Operations and Careers"), c("THN", "Webinar: How to Build AI Threat Readiness Into Your Security Operations")), 2);
  assert.equal(aantal(c("CISA", "Hitachi Energy CoreTec Product"), c("CISA", "Hitachi Energy TRO600 series products")), 2);
});
t("negatief: standaardtitels (software-updates, omgevingsvergunningen) horen niet bij elkaar", () => {
  assert.equal(aantal(c("Tweakers", "Software-update - ExifTool 13.60"), c("Tweakers", "Software-update - Chocolatey 2.7.5"), c("Tweakers", "Software-update - PicView 5.2.0.1")), 3);
  assert.equal(aantal(
    c("Officiële bekendmakingen", "Gemeente Haarlem, ingekomen aanvraag omgevingsvergunning, t.h.v. Engelandlaan 1 2034PG Haarlem, 0392-2026-0173317, het kappen van een boom wegens stambreuk, ontvangen op 26-10-2026", "", "haarlem"),
    c("Officiële bekendmakingen", "Gemeente Haarlem, ingekomen aanvraag omgevingsvergunning, Vergierdeweg 57 2025TH Haarlem, 0392-2026-0174228, het vervangen van de voordeur inclusief kozijn, ontvangen op 27-10-2026", "", "haarlem"),
    c("Officiële bekendmakingen", "Gemeente Haarlem, ingekomen aanvraag omgevingsvergunning, Waarderweg 39 2031BN Haarlem, 0392-2026-0174199, het realiseren van een opbouw tbv een technische ruimte, ontvangen op 27-10-2026", "", "haarlem")), 3);
});
t("behoud: bestaande samenvoeging met 4+ gedeelde woorden en hoge overlap", () => {
  assert.equal(aantal(c("NOS", "Brand legt fabriek in Zaandam volledig in de as", "", "nl"), c("NU", "Grote brand legt fabriek in Zaandam in de as", "", "nl")), 1);
});

console.log(`${n} tests ok`);
