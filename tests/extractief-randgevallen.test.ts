// Randgevallen van de extractieve fallback, zonder netwerk of klok.
import assert from "node:assert/strict";
import { extractief, zinnen } from "../worker/src/extractief";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("afkortingen blijven binnen de zin bij hoofdletters erna", () => {
  assert.deepEqual(zinnen("Dhr. Jansen bezocht o.a. Haarlem. Daarna vertrok hij."), [
    "Dhr. Jansen bezocht o.a. Haarlem.", "Daarna vertrok hij.",
  ]);
});

t("meerdere voorletters blijven bij de naam en de volgende zin blijft apart", () => {
  assert.deepEqual(zinnen("J. P. Jansen spreekt. A. de Vries luistert!"), [
    "J. P. Jansen spreekt.", "A. de Vries luistert!",
  ]);
});

t("afkortingen en voorletters blijven ook in de extractieve samenvatting intact", () => {
  assert.deepEqual(extractief({ t: "Bezoek", s: "Dhr. J. Jansen bezocht o.a. Haarlem. Daarna vertrok hij." }, true), {
    kop: "Bezoek", ai: "Dhr. J. Jansen bezocht o.a. Haarlem.",
    samenvatting: "Dhr. J. Jansen bezocht o.a. Haarlem. Daarna vertrok hij.",
  });
});

t("podcast-, live- en videoprefixes verdwijnen uit de kop", () => {
  for (const titel of ["Podcast | Storm op komst", "LIVE Storm op komst", "VIDEO: Storm op komst"]) {
    assert.equal(extractief({ t: titel, s: "Het gaat hard waaien." }, true)?.kop, "Storm op komst");
  }
});

t("HTML en benoemde en numerieke entiteiten worden in de kop opgeschoond", () => {
  assert.equal(extractief({ t: "Podcast | <b>Tom &amp; Jerry</b>&nbsp;&#8211; caf&#xE9;", s: "Meer nieuws." }, true)?.kop, "Tom & Jerry – café");
  assert.equal(extractief({ t: "LIVE | A &amp;amp; B", s: "Meer nieuws." }, true)?.kop, "A & B");
});

t("kop van precies 120 tekens blijft ongewijzigd", () => {
  const titel = "woord ".repeat(19) + "a".repeat(6);
  assert.equal(titel.length, 120);
  assert.equal(extractief({ t: titel }, true)?.kop, titel);
});

t("langere kop wordt op een woordgrens ingekort", () => {
  const titel = "woord ".repeat(20) + "langwoord extra";
  const kop = extractief({ t: titel }, true)!.kop;
  assert.equal(kop, "woord ".repeat(19).trimEnd() + "…");
  assert.ok(kop.length <= 120);
});

t("Engelse omschrijving levert uitsluitend de eerste zin in beide velden", () => {
  assert.deepEqual(extractief({ t: "New discovery", s: "Dr. Smith made a discovery. More details follow!" }, false), {
    kop: "New discovery", ai: "(Engels) Dr. Smith made a discovery.",
    samenvatting: "(Engels) Dr. Smith made a discovery.",
  });
});

t("lege en ontbrekende omschrijving vallen terug op de kop of Engelse melding", () => {
  for (const invoer of [{ t: "Nieuws", s: "" }, { t: "Nieuws" }, { t: "Nieuws", s: "   " }]) {
    assert.deepEqual(extractief(invoer, true), { kop: "Nieuws", ai: "Nieuws", samenvatting: "Nieuws" });
    assert.deepEqual(extractief(invoer, false), {
      kop: "Nieuws", ai: "(Engels) Engelstalig bericht, lees het via de bron.",
      samenvatting: "(Engels) Engelstalig bericht, lees het via de bron.",
    });
  }
});

t("ontbrekende titel en omschrijving leveren geen resultaat", () => {
  for (const invoer of [{}, { t: "", s: "" }, { s: "   " }]) {
    assert.equal(extractief(invoer, true), null);
    assert.equal(extractief(invoer, false), null);
  }
});

console.log(`${n} tests ok`);