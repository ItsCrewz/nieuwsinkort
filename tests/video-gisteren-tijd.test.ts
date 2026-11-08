// #817: terugval naar gisteren voor filmpjes zonder numerieke t, met alleen HH:MM.
import assert from "node:assert/strict";
import { afgeleideTijd, alleenVandaag } from "../src/vandaag";

let fouten = 0;
const t = (naam: string, f: () => void) => { try { f(); } catch (e) { fouten++; console.error("FOUT", naam, e); } };
const nu = Date.parse("2026-11-06T07:30:00Z"); // 08:30 Amsterdam
const gen = "2026-11-05T21:00:00Z"; // 05-11 22:00 Amsterdam
const ids = (d: any) => d.filmpjes.map((v: any) => v.id);

t("alleen tijd: gisteren behouden en gelabeld", () => {
  const d = alleenVandaag({ gegenereerd: gen, items: [], dumpert: [], filmpjes: [{ id: "a", tijd: "09:15" }, { id: "b", tijd: "23:59" }] }, nu);
  assert.deepEqual(ids(d), ["a", "b"]);
  assert.ok(d.filmpjes.every((v: any) => v.gisteren));
});
t("ongeldige tijd valt af", () => {
  const d = alleenVandaag({ gegenereerd: gen, items: [], dumpert: [], filmpjes: [{ id: "a", tijd: "25:00" }, { id: "b", tijd: "9:15" }, { id: "c" }, { id: "d", tijd: "10:00", t: "x" }] }, nu);
  assert.deepEqual(ids(d), []);
});
t("numerieke t blijft leidend", () => {
  const d = alleenVandaag({ gegenereerd: gen, items: [], dumpert: [], filmpjes: [{ id: "a", tijd: "09:15", t: Date.parse("2026-11-05T08:15:00Z") }, { id: "b", tijd: "10:00", t: Date.parse("2026-11-04T10:00:00Z") }] }, nu);
  assert.deepEqual(ids(d), ["a"]);
});
t("na 10:00 vervalt de terugval", () => {
  const d = alleenVandaag({ gegenereerd: gen, items: [], dumpert: [], filmpjes: [{ id: "a", tijd: "09:15" }] }, Date.parse("2026-11-06T09:30:00Z"));
  assert.deepEqual(ids(d), []);
});
t("dataset van twee dagen terug wordt niet als gisteren getoond", () => {
  const d = alleenVandaag({ gegenereerd: "2026-11-04T12:00:00Z", items: [], dumpert: [], filmpjes: [{ id: "a", tijd: "09:15" }] }, nu);
  assert.deepEqual(ids(d), []);
});
t("vandaag heeft voorrang", () => {
  const d = alleenVandaag({ gegenereerd: "2026-11-06T07:00:00Z", items: [], dumpert: [], filmpjes: [{ id: "a", tijd: "07:50" }, { id: "b", tijd: "23:00" }] }, nu);
  assert.deepEqual(ids(d), ["a"]);
  assert.ok(!d.filmpjes[0].gisteren);
});
t("wintertijdwissel: 09:15 op 25-10-2026 blijft 09:15 lokaal", () => {
  const d = alleenVandaag({ gegenereerd: "2026-10-25T10:00:00Z", items: [], dumpert: [], filmpjes: [{ id: "a", tijd: "09:15" }] }, Date.parse("2026-10-26T07:00:00Z"));
  assert.deepEqual(ids(d), ["a"]);
  assert.ok(d.filmpjes[0].gisteren);
  assert.equal(afgeleideTijd({ tijd: "09:15" }, Date.parse("2026-10-25T10:00:00Z")), Date.parse("2026-10-25T08:15:00Z"));
});
t("zomertijdwissel: 23:30 en 09:15 op 28-03-2027 blijven gisteren", () => {
  const d = alleenVandaag({ gegenereerd: "2027-03-28T10:00:00Z", items: [], dumpert: [], filmpjes: [{ id: "a", tijd: "09:15" }, { id: "b", tijd: "23:30" }] }, Date.parse("2027-03-29T06:00:00Z"));
  assert.deepEqual(ids(d), ["a", "b"]);
  assert.ok(d.filmpjes.every((v: any) => v.gisteren));
});
t("niet-bestaande tijd (02:30 op 28-03-2027) valt af", () => {
  assert.equal(afgeleideTijd({ tijd: "02:30" }, Date.parse("2027-03-28T10:00:00Z")), null);
});
t("nu vlak na middernacht: filmpje van 23:40 de vorige avond blijft", () => {
  const d = alleenVandaag({ gegenereerd: gen, items: [], dumpert: [], filmpjes: [{ id: "a", tijd: "23:40" }] }, Date.parse("2026-11-05T23:05:00Z"));
  assert.deepEqual(ids(d), ["a"]);
  assert.ok(d.filmpjes[0].gisteren);
});
if (fouten) process.exit(1);
