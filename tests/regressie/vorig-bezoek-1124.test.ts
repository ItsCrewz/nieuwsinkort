import assert from "node:assert/strict";
import { filterNieuws, maakVorigBezoek, STANDAARD } from "../../src/filters";
import type { Item } from "../../src/types";

const g = globalThis as any;
const lokaalOrigineel = Object.getOwnPropertyDescriptor(g, "localStorage");
const sessieOrigineel = Object.getOwnPropertyDescriptor(g, "sessionStorage");
const nuOrigineel = Date.now;
const lokaal = new Map<string, string>();
const sessie = new Map<string, string>();
const opslag = (waarden: Map<string, string>) => ({
  getItem: (key: string) => waarden.get(key) ?? null,
  setItem: (key: string, value: string) => { waarden.set(key, value); },
});
const bezoek = "nieuwsinkort-laatste-bezoek";
const referentie = "nieuwsinkort-bezoek-ref";
const items: Item[] = [
  { kop: "oud", tijd: "", t: 1000, cat: "nl", ai: "", samenvatting: "", punten: [], bronnen: [] },
  { kop: "nieuw", tijd: "", t: 3000, cat: "nl", ai: "", samenvatting: "", punten: [], bronnen: [] },
];
const filter = (vorig: number) => filterNieuws(items, { ...STANDAARD, tijd: "sinds" }, vorig, undefined, true).items.map((item) => item.kop);

try {
  g.localStorage = opslag(lokaal);
  g.sessionStorage = opslag(sessie);
  Date.now = () => 4000;
  for (const waarde of ["5000", "Infinity", "ongeldig", "-1"]) {
    lokaal.set(bezoek, waarde);
    sessie.clear();
    assert.deepEqual(filter(maakVorigBezoek()()), ["nieuw", "oud"], `lokale opslag: ${waarde}`);
  }
  lokaal.set(bezoek, "2000");
  sessie.clear();
  assert.deepEqual(filter(maakVorigBezoek()()), ["nieuw"]);
  lokaal.set(bezoek, "4000");
  assert.deepEqual(filter(maakVorigBezoek()()), ["nieuw"], "herladen behoudt de sessiereferentie");
  sessie.set(referentie, "5000");
  assert.deepEqual(filter(maakVorigBezoek()()), ["nieuw", "oud"], "toekomstige sessiereferentie");
  sessie.set(referentie, "2000");
  const vast = maakVorigBezoek()();
  Date.now = () => 1500;
  assert.deepEqual(filter(vast), ["nieuw", "oud"], "klokcorrectie tijdens de sessie");
  assert.deepEqual(filter(maakVorigBezoek()()), ["nieuw", "oud"], "klokcorrectie bij herladen");
  console.log("✓ toekomstig vorig bezoek en klokcorrectie");
} finally {
  Date.now = nuOrigineel;
  if (lokaalOrigineel) Object.defineProperty(g, "localStorage", lokaalOrigineel); else delete g.localStorage;
  if (sessieOrigineel) Object.defineProperty(g, "sessionStorage", sessieOrigineel); else delete g.sessionStorage;
}
