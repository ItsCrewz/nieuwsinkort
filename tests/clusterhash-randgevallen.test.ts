// Draai: npm run test  (randgevallen van clusterHash en vindClusterSum, worker/src/clusterhash.ts; issue #240)
import assert from "node:assert/strict";
import { clusterHash, vindClusterSum } from "../worker/src/clusterhash";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

const NU = Date.UTC(2025, 0, 15, 12, 0, 0), DAG = 24 * 3600e3;

t("minder dan twee bruikbare woorden geeft een lege hash", () => {
  assert.equal(clusterHash("", "nl"), "");
  assert.equal(clusterHash("Brand", "nl"), "");
  assert.equal(clusterHash("Brand in de zee", "nl"), "");
  assert.equal(clusterHash("Brand brand BRAND", "nl"), "");
});

t("stopwoorden en woorden korter dan 4 tekens tellen niet mee", () => {
  assert.equal(clusterHash("de kat en zee gaat naar niet", "nl"), "");
  assert.equal(clusterHash("Brand voor tegen tussen", "nl"), "");
  assert.equal(clusterHash("abc brand", "nl"), "");
  assert.equal(clusterHash("brand brug", "nl"), JSON.stringify(["nl", ["brand", "brug"]]));
});

t("volgorde, hoofdletters, leestekens en dubbelen veranderen de hash niet", () => {
  const a = clusterHash("Brand bij school", "nl");
  assert.equal(a, JSON.stringify(["nl", ["brand", "school"]]));
  assert.equal(clusterHash("SCHOOL, brand!", "nl"), a);
  assert.equal(clusterHash("school brand school", "nl"), a);
});

t("NFKC-varianten geven dezelfde hash", () => {
  assert.equal(clusterHash("ｂｒａｎｄ ｓｃｈｏｏｌ", "nl"), clusterHash("brand school", "nl"));
  assert.equal(clusterHash("café ﬁlm", "nl"), clusterHash("café film", "nl"));
});

t("cijfers tellen als woord", () => {
  assert.equal(clusterHash("2025 brand", "nl"), JSON.stringify(["nl", ["2025", "brand"]]));
});

t("andere rubriek geeft een andere hash", () => {
  assert.notEqual(clusterHash("brand school", "nl"), clusterHash("brand school", "haarlem"));
});

const sum = (at: number) => ({ at, tekst: "x" });
const hash = clusterHash("brand school", "nl");
const hashes = { [hash]: "a" };

t("vindClusterSum: precies 24 uur is te oud, net eronder niet", () => {
  const s = sum(NU - DAG);
  assert.equal(vindClusterSum(hashes, { a: s }, "brand school", "nl", NU), null);
  const j = sum(NU - DAG + 1);
  assert.equal(vindClusterSum(hashes, { a: j }, "brand school", "nl", NU), j);
});

t("vindClusterSum: samenvatting uit de toekomst of van nu", () => {
  assert.equal(vindClusterSum(hashes, { a: sum(NU + 1) }, "brand school", "nl", NU), null);
  const nu = sum(NU);
  assert.equal(vindClusterSum(hashes, { a: nu }, "brand school", "nl", NU), nu);
});

t("vindClusterSum: lege hash, onbekende hash of ontbrekende samenvatting", () => {
  const s = sum(NU - 1000);
  assert.equal(vindClusterSum(hashes, { a: s }, "brand", "nl", NU), null);
  assert.equal(vindClusterSum(hashes, { a: s }, "brand school", "haarlem", NU), null);
  assert.equal(vindClusterSum(hashes, {}, "brand school", "nl", NU), null);
  assert.equal(vindClusterSum({}, { a: s }, "school brand", "nl", NU), null);
});

console.log(`${n} tests ok`);
