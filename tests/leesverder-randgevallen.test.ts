// Randgevallen van Lees verder en detailinhoud, zonder netwerk of echte tijd.
import assert from "node:assert/strict";
import { detailInhoud, heeftLeesVerder } from "../src/leesverder";
import type { Item } from "../src/types";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const basis: Item = { cat: "nl", kop: "Nieuws", ai: "", samenvatting: "", punten: [], tijd: "12:00", bronnen: [] };

t("zonder tekst zijn Lees verder en de detailinhoud leeg", () => {
  assert.equal(heeftLeesVerder(basis), false);
  assert.deepEqual(detailInhoud(basis), { paragraphs: [], punten: [], bronnen: [] });
});

t("ontbrekende tekstvelden leveren geen detailinhoud op", () => {
  const { ai: _ai, samenvatting: _samenvatting, punten: _punten, bronnen: _bronnen, ...zonder } = basis;
  assert.equal(heeftLeesVerder(zonder as Item), false);
  assert.deepEqual(detailInhoud(zonder as Item), { paragraphs: [], punten: [], bronnen: [] });
});

t("alleen witruimte in tekst levert geen Lees verder of alinea's op", () => {
  const item = { ...basis, ai: " \t\n", samenvatting: "\n  \n\t " };
  assert.equal(heeftLeesVerder(item), false);
  assert.deepEqual(detailInhoud(item), { paragraphs: [], punten: [], bronnen: [] });
});

t("gelijke kaarttekst en samenvatting blijven beschikbaar als detail", () => {
  const tekst = "Dezelfde tekst op de kaart en in de samenvatting.";
  const item = { ...basis, ai: tekst, samenvatting: tekst };
  assert.equal(heeftLeesVerder(item), true);
  assert.deepEqual(detailInhoud(item), { paragraphs: [tekst], punten: [], bronnen: [] });
});

t("alleen kaarttekst geeft Lees verder maar geen samenvattingsalinea", () => {
  const item = { ...basis, ai: "Korte kaarttekst." };
  assert.equal(heeftLeesVerder(item), true);
  assert.deepEqual(detailInhoud(item), { paragraphs: [], punten: [], bronnen: [] });
});

t("zeer lange samenvatting blijft volledig en in volgorde behouden", () => {
  const eerste = "Eerste zin. ".repeat(10000);
  const tweede = "Tweede zin. ".repeat(10000);
  const item = { ...basis, samenvatting: `${eerste}\n\n${tweede}` };
  assert.equal(heeftLeesVerder(item), true);
  assert.deepEqual(detailInhoud(item), { paragraphs: [eerste, tweede], punten: [], bronnen: [] });
});

t("alleen een bronlink geeft geen Lees verder maar blijft in details", () => {
  const bronnen = [{ site: "Voorbeeld", href: "https://example.org/bericht" }];
  const item = { ...basis, bronnen };
  assert.equal(heeftLeesVerder(item), false);
  assert.deepEqual(detailInhoud(item), { paragraphs: [], punten: [], bronnen });
});

t("alleen een meer-sleutel geeft wel Lees verder zonder lokale tekst", () => {
  const item = { ...basis, meer: "bericht-1" };
  assert.equal(heeftLeesVerder(item), true);
  assert.deepEqual(detailInhoud(item), { paragraphs: [], punten: [], bronnen: [] });
});