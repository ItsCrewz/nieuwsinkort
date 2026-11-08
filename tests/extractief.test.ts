// Draai: npm test  (extractieve samenvatting zonder AI, worker/src/extractief.ts)
import assert from "node:assert/strict";
import { eersteZinnen, extractief, schoon, zinnen } from "../worker/src/extractief";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
const aantal = (s: string) => s.split(/\s+/).filter(Boolean).length;

t("prefixes Podcast |, LIVE en VIDEO vallen weg", () => {
  assert.equal(schoon("Podcast | De week van Wilders"), "De week van Wilders");
  assert.equal(schoon("LIVE | Brand in Haarlem"), "Brand in Haarlem");
  assert.equal(schoon("LIVE Brand in Haarlem"), "Brand in Haarlem");
  assert.equal(schoon("VIDEO: Kijk naar de storm"), "Kijk naar de storm");
  assert.equal(schoon("Live-muziek in de stad"), "Live-muziek in de stad");
});
t("HTML, entiteiten en dubbele spaties worden opgeschoond", () => {
  assert.equal(schoon("<p>Tom &amp; Jerry&nbsp;&nbsp;winnen  &#8211; &#x2019;s avonds</p>"), "Tom & Jerry winnen – ’s avonds");
  assert.equal(schoon("&amp;amp; dubbel"), "& dubbel");
});
t("zinsgrenzen negeren afkortingen en voorletters", () => {
  assert.deepEqual(zinnen("Dhr. Jansen zei o.a. dat het regent. Daarna werd het droog! J. de Vries bevestigt dat."), ["Dhr. Jansen zei o.a. dat het regent.", "Daarna werd het droog!", "J. de Vries bevestigt dat."]);
  assert.deepEqual(zinnen("Er kwamen ca. 300 mensen. Bijv. uit Zwolle."), ["Er kwamen ca. 300 mensen.", "Bijv. uit Zwolle."]);
});
t("samenvatting heeft hooguit 3 zinnen en ±50 woorden", () => {
  const zin = "Dit is een zin met precies tien woorden erin, echt waar hoor.";
  const r = extractief({ t: "Kop", s: Array(8).fill(zin).join(" ") }, true)!;
  assert.ok(aantal(r.samenvatting) <= 50);
  assert.ok(zinnen(r.samenvatting).length <= 3);
  assert.equal(r.ai, zin);
  const lang = eersteZinnen(Array(80).fill("woord").join(" ") + ".", 50);
  assert.ok(aantal(lang) <= 50 && lang.endsWith("…"));
});
t("kop wordt ingekort en omschrijving die met de kop begint wordt niet herhaald", () => {
  const r = extractief({ t: "Podcast | " + "lange ".repeat(40) + "kop…", s: "Tweede zin hier." }, true)!;
  assert.ok(r.kop.length <= 120 && r.kop.endsWith("…") && !r.kop.startsWith("Podcast"));
  const d = extractief({ t: "Storm treft kust", s: "Storm treft kust. Er zijn schade en overlast." }, true)!;
  assert.equal(d.samenvatting, "Er zijn schade en overlast.");
});
t("Engelse bron krijgt titel, eerste zin en label (Engels)", () => {
  const r = extractief({ t: "New chip announced", s: "<p>The chip is faster. It also costs less.</p>" }, false)!;
  assert.equal(r.kop, "New chip announced");
  assert.equal(r.ai, "(Engels) The chip is faster.");
  assert.ok(r.samenvatting.startsWith("(Engels)"));
});
t("een niet-NL cluster zonder AI levert wel een item (ook zonder omschrijving)", () => {
  const r = extractief({ t: "Rust 2.0 released", s: "" }, false);
  assert.ok(r && r.ai.startsWith("(Engels)") && r.ai.length > 10);
});
t("nooit lege tekst bij bruikbare titel; null bij niets", () => {
  for (const nl of [true, false]) {
    const r = extractief({ t: "LIVE | Kop", s: "" }, nl)!;
    assert.ok(r.kop && r.ai && r.samenvatting);
  }
  const p = extractief({ t: "", s: "Eerste zin van de post. Rest van de post." }, true)!;
  assert.equal(p.kop, "Eerste zin van de post.");
  assert.equal(extractief({ t: " LIVE | ", s: "" }, true), null);
});

console.log(`${n} tests ok`);
