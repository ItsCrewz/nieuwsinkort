// Draai: npm run test  (bundelt met esbuild en draait met node)
// Randgevallen van merge() in functions/data.json.ts, met vaste klok en zonder netwerk.
import assert from "node:assert/strict";
import { merge } from "../functions/data.json";

let n = 0;
const t = (name: string, fn: () => void) => {
  const origineel = Date.now;
  Date.now = () => Date.parse("2026-10-29T12:00:00+01:00");
  try { fn(); } finally { Date.now = origineel; }
  n++; console.log("✓", name);
};

const GISTEREN = "2026-10-28T20:00:00+01:00";
const ROUTINE = "2026-10-29T08:00:00+01:00";
const UUR = "2026-10-29T11:00:00+01:00";
const item = (kop: string, href: string, extra: any = {}) => ({ cat: "nl", kop, bronnen: [{ site: "X", href }], ...extra });
const clip = (i: number, extra: any = {}) => ({ titel: `Clip ${i}`, href: `https://v.nl/${i}`, bron: "YouTube", tijd: "10:00", ...extra });

t("uur-data van gisteren wordt genegeerd: statische data blijft ongewijzigd", () => {
  const S = { gegenereerd: ROUTINE, items: [item("A", "https://nos.nl/1")], filmpjes: [], dumpert: [] };
  const H = { gegenereerd: GISTEREN, items: [item("B", "https://nos.nl/2")], filmpjes: [clip(1)] };
  assert.equal(merge(S, H), S);
  assert.equal(merge(S, null), S);
});

t("statische data van gisteren met verse uur-data: alleen uur-data, geen routine", () => {
  const S = { gegenereerd: GISTEREN, items: [item("Oud", "https://nos.nl/oud")], filmpjes: [clip(9, { tijd: "23:00" })], dumpert: [], dag_samenvatting: "oud" };
  const H = { gegenereerd: UUR, datum: "29 oktober", items: [item("Nieuw", "https://nos.nl/nieuw")], filmpjes: [clip(1, { tijd: "00:01" })], dumpert: [], dag_samenvatting: "vers" };
  const out = merge(S, H);
  assert.equal(out.routine_gegenereerd, null);
  assert.equal(out.gegenereerd, UUR);
  assert.equal(out.dag_samenvatting, "vers");
  // zonder routine van vandaag telt de tijdgrens niet: alle uur-filmpjes blijven
  assert.deepEqual(out.filmpjes.map((v: any) => v.href), ["https://v.nl/1"]);
  assert.deepEqual(out.items.map((i: any) => i.kop), ["Nieuw"]);
});

t("dubbele berichten via genormaliseerde bronlinks (www, https, query, slash, hoofdletters)", () => {
  const S = { gegenereerd: ROUTINE, items: [item("A", "https://www.nos.nl/artikel/1/"), item("B", "http://Krant.nl/b?utm=1#x")], filmpjes: [], dumpert: [] };
  const H = { gegenereerd: UUR, dumpert: [], filmpjes: [], items: [
    item("A2", "http://nos.nl/artikel/1"), item("B2", "https://www.krant.nl/b/"), item("C", "https://nos.nl/artikel/3"),
    { cat: "nl", kop: "Zonder bronnen" },
    { cat: "nl", kop: "Tweede bron dubbel", bronnen: [{ href: "https://x.nl/uniek" }, { href: "https://nos.nl/artikel/1?ref=2" }] }] };
  const out = merge(S, H);
  assert.deepEqual(out.items.map((i: any) => i.kop), ["C", "Zonder bronnen", "A", "B"]);
  assert.equal(out.uur.nieuw, 2);
});

t("filmpjes: Shorts begrensd op 12, Journaals op 10, onafhankelijk van elkaar", () => {
  const S = { gegenereerd: ROUTINE, items: [], filmpjes: [clip(900, { tijd: "07:00" })], dumpert: [] };
  const shorts = Array.from({ length: 15 }, (_, i) => clip(i));
  const journaals = Array.from({ length: 13 }, (_, i) => clip(100 + i, { soort: "journaal" }));
  const out = merge(S, { gegenereerd: UUR, items: [], dumpert: [], filmpjes: [...journaals, ...shorts] });
  const nieuw = out.filmpjes.slice(0, -1);
  assert.equal(nieuw.filter((v: any) => v.soort !== "journaal").length, 12);
  assert.equal(nieuw.filter((v: any) => v.soort === "journaal").length, 10);
  assert.equal(out.filmpjes.at(-1).href, "https://v.nl/900"); // routine-filmpjes blijven achteraan
  assert.equal(nieuw[0].href, "https://v.nl/0"); // eerst Shorts, dan Journaals
  // veel journaals drukken de Shorts niet weg
  const alleenJ = merge(S, { gegenereerd: UUR, items: [], dumpert: [], filmpjes: [...journaals, clip(1)] });
  assert.equal(alleenJ.filmpjes.length, 1 + 10 + 1);
});

t("filmpjes: tijdgrens van de routine, bestaande hrefs en Instagram van vóór de routine", () => {
  const S = { gegenereerd: ROUTINE, items: [], filmpjes: [clip(1, { tijd: "07:00" })], dumpert: [] };
  const H = { gegenereerd: UUR, items: [], dumpert: [], filmpjes: [
    clip(1, { tijd: "10:00" }), // al in routine
    clip(2, { tijd: "07:59" }), // vóór routine (08:00): weg
    clip(3, { tijd: "08:00" }), // precies op de grens: blijft
    clip(4, { tijd: undefined }), // zonder tijd: weg
    clip(5, { tijd: "06:00", bron: "Instagram" }), // Instagram van vóór routine: blijft
    clip(6, { tijd: undefined, bron: "Instagram" })] };
  const out = merge(S, H);
  assert.deepEqual(out.filmpjes.map((v: any) => v.href), ["https://v.nl/3", "https://v.nl/5", "https://v.nl/6", "https://v.nl/1"]);
});

t("meerKeys: routine-berichten krijgen meer-sleutel; bestaande meer blijft; meta/meerKeys lekken niet", () => {
  const S = { gegenereerd: ROUTINE, items: [item("A", "https://www.nos.nl/a/"), item("B", "https://nos.nl/b", { meer: "eigen" }), item("C", "https://nos.nl/c")], filmpjes: [], dumpert: [] };
  const H = { gegenereerd: UUR, dumpert: [], filmpjes: [], meta: { model: "m", aiStand: "ok" }, meerKeys: ["nos.nl/a", "nos.nl/b", "x.nl/d"],
    items: [item("D", "https://x.nl/d?z=1")] };
  const out = merge(S, H);
  const per = Object.fromEntries(out.items.map((i: any) => [i.kop, i.meer]));
  assert.deepEqual(per, { D: "x.nl/d", A: "nos.nl/a", B: "eigen", C: undefined });
  assert.equal(out.meerKeys, undefined);
  assert.equal(out.uur.model, "m");
  // geen of ongeldige meerKeys: items ongemoeid
  for (const meerKeys of [undefined, "nos.nl/a", []]) {
    const o = merge(S, { ...H, meerKeys });
    assert.ok(o.items.every((i: any) => i.meer === undefined || i.kop === "B"));
  }
});

console.log(`\n${n} tests geslaagd`);

t("grote uurupdate houdt maximaal 150 nieuwste berichten van vandaag", () => {
  const nu = Date.now();
  const items = Array.from({ length: 200 }, (_, i) => item(String(i), `https://nos.nl/${i}`, { t: nu - i * 1000 }));
  items.push(item("gisteren", "https://nos.nl/oud", { t: nu - 86400000 }));
  const out = merge({ gegenereerd: GISTEREN }, { gegenereerd: UUR, items: items.reverse() });
  assert.equal(out.items.length, 150);
  assert.equal(out.items[0].kop, "0");
  assert.equal(out.items[149].kop, "149");
});
