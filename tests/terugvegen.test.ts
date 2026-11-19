import assert from "node:assert/strict";
import { besluit, magStarten, recenteSnelheid, sluit, veegBreedte } from "../src/terugvegen";

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
t("terugvegen: pauze en daarna snelle veeg sluit, even lang langzaam niet", () => {
  const pauze = [{ dx: 0, t: 0 }, { dx: 12, t: 600 }, { dx: 50, t: 640 }, { dx: 80, t: 660 }];
  assert.equal(sluit(80, 390, 660, recenteSnelheid(pauze, 670)), true);
  assert.equal(sluit(80, 390, 660), false); // gemiddelde over de hele duur is te traag
  const traag = [{ dx: 0, t: 0 }, { dx: 30, t: 300 }, { dx: 55, t: 600 }, { dx: 80, t: 900 }];
  assert.equal(sluit(80, 390, 900, recenteSnelheid(traag, 910)), false);
});
t("terugvegen: snel maar onder FLICK_MIN of stilgehouden vinger sluit niet", () => {
  const kort = [{ dx: 0, t: 0 }, { dx: 30, t: 40 }];
  assert.equal(sluit(30, 390, 40, recenteSnelheid(kort, 45)), false);
  const stil = [{ dx: 0, t: 0 }, { dx: 80, t: 50 }];
  assert.equal(recenteSnelheid(stil, 400), undefined);
  assert.equal(sluit(80, 390, 400, recenteSnelheid(stil, 400)), false);
});

t("terugvegen: veegBreedte volgt het artikel, met veilige terugval", () => {
  const rect = (width: number, extra = {}) => ({ getBoundingClientRect: () => ({ width }), ...extra }) as unknown as Element;
  assert.equal(veegBreedte(rect(300), 1000), 300);
  assert.equal(veegBreedte(rect(1200), 1000), 1000);
  assert.equal(veegBreedte(rect(0, { clientWidth: 280 }), 1000), 280);
  assert.equal(veegBreedte(rect(NaN, { offsetWidth: 260 }), 1000), 260);
  assert.equal(veegBreedte(rect(0), 1000), 1000);
  assert.equal(veegBreedte({} as Element, 400), 400);
  assert.equal(veegBreedte(null, 400), 400);
});
