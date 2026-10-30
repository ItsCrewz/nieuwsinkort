import assert from "node:assert/strict";
import { MAX_ALARMS_PER_UUR, volgorde } from "../worker/src/vooraf";

let n = 0;
const t = (naam: string, fn: () => void) => { fn(); n++; console.log("✓", naam); };

t("ontbrekende en lege data leveren een lege lijst", () => {
  for (const data of [undefined, null, {}, { filmpjes: [], dumpert: [] }, { filmpjes: null, dumpert: null }]) {
    assert.deepEqual(volgorde(data), []);
  }
});

t("een ontbrekende feed laat de andere feed ongemoeid", () => {
  const filmpje = { titel: "Kort", href: "https://voorbeeld.nl/kort", soort: "short" };
  const dumpert = { titel: "Los", href: "https://voorbeeld.nl/los" };
  assert.deepEqual(volgorde({ filmpjes: [filmpje] }), [filmpje]);
  assert.deepEqual(volgorde({ dumpert: [dumpert] }), [dumpert]);
});

t("items zonder href worden overgeslagen, ook als ze een embed hebben", () => {
  const goed = { titel: "Goed", href: "https://voorbeeld.nl/goed", soort: "short" };
  const zonder = { titel: "Geen link", href: "", embed: "https://youtu.be/abcdefg", soort: "short" };
  assert.deepEqual(volgorde({ filmpjes: [zonder, goed], dumpert: [{ titel: "Ontbreekt" }] }), [goed]);
});

t("zonder expliciete slug wordt de titel gebruikt en blijven unieke titels staan", () => {
  const een = { titel: "Eerste video", href: "https://voorbeeld.nl/1" };
  const twee = { titel: "Tweede video", href: "https://voorbeeld.nl/2" };
  assert.deepEqual(volgorde({ dumpert: [een, twee] }), [een, twee]);
});

t("dubbele afgeleide titels en lege titels behouden de eerste", () => {
  const een = { titel: "Café nieuws!", href: "https://voorbeeld.nl/1" };
  const dubbel = { titel: "Cafe nieuws", href: "https://voorbeeld.nl/2" };
  const leeg = { titel: "", href: "https://voorbeeld.nl/3" };
  const ookLeeg = { titel: "!!!", href: "https://voorbeeld.nl/4" };
  assert.deepEqual(volgorde({ dumpert: [een, dubbel, leeg, ookLeeg] }), [een, leeg]);
});

t("dezelfde YouTube-slug in verschillende feeds behoudt de eerst bezochte versie", () => {
  const short = { titel: "Eerste", href: "https://youtube.com/shorts/abcdefg", soort: "short" };
  const journaal = { titel: "Tweede", href: "https://youtu.be/abcdefg", soort: "journaal" };
  const dumpert = { titel: "Derde", href: "https://voorbeeld.nl/3", embed: "https://youtube.com/embed/abcdefg" };
  assert.deepEqual(volgorde({ filmpjes: [journaal, short], dumpert: [dumpert] }), [short]);
});

t("gelijke prioriteit volgt de verweven feeds, ook bij ongelijke lengtes", () => {
  const s1 = { titel: "Short 1", href: "https://voorbeeld.nl/s1", soort: "short" };
  const s2 = { titel: "Short 2", href: "https://voorbeeld.nl/s2", soort: "short" };
  const s3 = { titel: "Short 3", href: "https://voorbeeld.nl/s3", soort: "short" };
  const j1 = { titel: "Journaal 1", href: "https://voorbeeld.nl/j1", soort: "journaal" };
  const d1 = { titel: "Dumpert 1", href: "https://voorbeeld.nl/d1" };
  const d2 = { titel: "Dumpert 2", href: "https://voorbeeld.nl/d2" };
  assert.deepEqual(volgorde({ filmpjes: [s1, s2, j1, s3], dumpert: [d1, d2] }), [s1, j1, d1, s2, d2, s3]);
});

t("YouTube gaat voor, met stabiele feedvolgorde binnen beide groepen", () => {
  const s1 = { titel: "Short 1", href: "https://voorbeeld.nl/s1", soort: "short" };
  const s2 = { titel: "Short 2", href: "https://youtube.com/shorts/abcdefg", soort: "short" };
  const j1 = { titel: "Journaal 1", href: "https://youtu.be/hijklmn", soort: "journaal" };
  const j2 = { titel: "Journaal 2", href: "https://voorbeeld.nl/j2", soort: "journaal" };
  const d1 = { titel: "Dumpert 1", href: "https://voorbeeld.nl/d1", embed: "https://youtube.com/embed/opqrstu" };
  const d2 = { titel: "Dumpert 2", href: "https://voorbeeld.nl/d2" };
  assert.deepEqual(volgorde({ filmpjes: [s1, s2, j1, j2], dumpert: [d1, d2] }), [j1, d1, s2, s1, j2, d2]);
});

t("maximaal drie alarmen per uur", () => {
  assert.equal(MAX_ALARMS_PER_UUR, 3);
});

console.log(`\n${n} volgorde-randgevaltests geslaagd`);