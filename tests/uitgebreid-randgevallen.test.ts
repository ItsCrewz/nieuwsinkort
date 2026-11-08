import assert from "node:assert/strict";
import { uitgebreidAlineas, zonderUitleg } from "../src/uitgebreid";
import type { Item } from "../src/types";

const t = (naam: string, f: () => void) => { f(); console.log("ok -", naam); };
const item = (o: Partial<Item> = {}): Item => ({ cat: "nl", kop: "Kop van het bericht", ai: "", samenvatting: "", punten: [], tijd: "12:00", bronnen: [], ...o });
const bron = (alineas?: string[]) => ({ site: "A", href: "https://a.nl", alineas: alineas as string[] });

t("meer null, undefined en {} geven dezelfde eigen tekst", () => {
  const i = item({ ai: "Eigen tekst." });
  assert.deepEqual(uitgebreidAlineas(i, null), ["Eigen tekst."]);
  assert.deepEqual(uitgebreidAlineas(i, undefined), ["Eigen tekst."]);
  assert.deepEqual(uitgebreidAlineas(i, {}), ["Eigen tekst."]);
});
t("lege uitleg en lege uittreksel-lijst vallen door naar het bericht", () => {
  assert.deepEqual(uitgebreidAlineas(item({ ai: "Eigen." }), { uitleg: [], uittreksel: [] }), ["Eigen."]);
  assert.deepEqual(uitgebreidAlineas(item({ ai: "Eigen." }), { uitleg: ["", "  "] }), ["Eigen."]);
});
t("alleen perBron: uitleg ontbreekt, uittreksel telt niet mee", () => {
  const m = { perBron: [{ site: "A", href: "https://a.nl", tekst: "Bron." }] } as any;
  assert.deepEqual(uitgebreidAlineas(item({ ai: "Eigen." }), m), ["Eigen."]);
});
t("alleen uittreksel: alineas van meerdere bronnen achter elkaar, getrimd, lege weg", () => {
  const m = { uittreksel: [bron([" Een. ", ""]), bron(undefined), bron(["Twee."])] };
  assert.deepEqual(uitgebreidAlineas(item({ ai: "Eigen." }), m), ["Een.", "Twee."]);
});
t("uittreksel met alleen lege alineas valt door naar het bericht", () => {
  assert.deepEqual(uitgebreidAlineas(item({ ai: "Eigen." }), { uittreksel: [bron(["  "]), bron([])] }), ["Eigen."]);
});
t("dubbele alinea's in het bericht worden ontdubbeld, in volgorde", () => {
  const i = item({ samenvatting: "A.", ai: "A.\n\nB.", punten: ["B.", "C."] });
  assert.deepEqual(uitgebreidAlineas(i, null), ["A.", "B.", "C."]);
});
t("dubbele alinea's uit de bron blijven ongemoeid", () => {
  assert.deepEqual(uitgebreidAlineas(item(), { uittreksel: [bron(["X.", "X."])] }), ["X.", "X."]);
});
t("item zonder ai-tekst gebruikt samenvatting of punten, anders de kop", () => {
  assert.deepEqual(uitgebreidAlineas(item({ samenvatting: "Sam." }), null), ["Sam."]);
  assert.deepEqual(uitgebreidAlineas(item({ punten: ["P1", "P2"] }), null), ["P1", "P2"]);
  assert.deepEqual(uitgebreidAlineas(item({ kop: "  Kop  " }), null), ["Kop"]);
});
t("niets beschikbaar: vaste tekst, ook bij lege of ontbrekende kop", () => {
  assert.deepEqual(uitgebreidAlineas(item({ kop: "   " }), null), ["Geen uitgebreidere tekst beschikbaar."]);
  assert.deepEqual(uitgebreidAlineas(item({ kop: undefined as any }), null), ["Geen uitgebreidere tekst beschikbaar."]);
});
t("zonderUitleg: lege cache geeft alles, volle cache niets, lege lijst niets", () => {
  const lijst = [{ key: "a" }, { key: "b" }];
  assert.deepEqual(zonderUitleg(lijst, {}), lijst);
  assert.deepEqual(zonderUitleg(lijst, { a: 1, b: { uitleg: [] } }), []);
  assert.deepEqual(zonderUitleg([], { a: 1 }), []);
});
t("zonderUitleg: falsy cachewaarde telt als ontbrekend, volgorde en extra velden blijven", () => {
  const lijst = [{ key: "a", n: 1 }, { key: "b", n: 2 }, { key: "c", n: 3 }];
  assert.deepEqual(zonderUitleg(lijst, { a: null, b: "x", c: 0 }), [lijst[0], lijst[2]]);
});
