import assert from "node:assert/strict";
import { besluit, magStarten, sluit } from "../src/terugvegen";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };

t("terugvegen: niet starten binnen 20px van de linkerrand (iOS-randgebaar)", () => {
  assert.equal(magStarten(0), false);
  assert.equal(magStarten(19), false);
  assert.equal(magStarten(20), true);
});
t("terugvegen: pas beslissen na meer dan 10px beweging", () => {
  assert.equal(besluit(5, 0), "wacht");
  assert.equal(besluit(10, 2), "wacht");
});
t("terugvegen: duidelijk horizontaal naar rechts is een veeg", () => {
  assert.equal(besluit(30, 10), "veeg");
  assert.equal(besluit(11, 0), "veeg");
});
t("terugvegen: verticaal, schuin of naar links is nooit een veeg", () => {
  assert.equal(besluit(2, 40), "nee");
  assert.equal(besluit(30, 25), "nee");
  assert.equal(besluit(30, 20), "nee"); // exact ratio 1,5 is niet genoeg
  assert.equal(besluit(-40, 0), "nee");
  assert.equal(besluit(0, 11), "nee");
});
t("terugvegen: sluiten bij 30% van de breedte, anders terugveren", () => {
  assert.equal(sluit(120, 390, 800), true);
  assert.equal(sluit(116, 390, 800), false);
});
t("terugvegen: snelle flick sluit ook onder de drempel, een trage of minieme niet", () => {
  assert.equal(sluit(60, 390, 100), true);
  assert.equal(sluit(60, 390, 300), false);
  assert.equal(sluit(20, 390, 10), false);
});
t("terugvegen: naar links of zonder beweging sluit nooit", () => {
  assert.equal(sluit(-200, 390, 100), false);
  assert.equal(sluit(0, 390, 100), false);
  assert.equal(sluit(100, 0, 100), false);
});
