// Foutclassificatie in src/budget.ts: dagquota (hele dag stil) tegenover tijdelijk (alleen deze run) en overig, plus neuronFactor en schatTokens.
// Legt het huidige gedrag vast; alleen pure functies, geen netwerk of tijd.
import assert from "node:assert/strict";
import { aiFout, isDagQuota, isTijdelijk, neuronFactor, schatTokens } from "../src/budget";

let n = 0;
const t = (naam: string, fn: () => void) => { fn(); n++; console.log("✓", naam); };

t("isDagQuota: code 4006 en vaste zinnen", () => {
  assert.equal(isDagQuota(new Error("4006: out of capacity")), true);
  assert.equal(isDagQuota("you have used up your daily free allocation"), true);
  assert.equal(isDagQuota("Daily free allocation reached"), true);
  assert.equal(isDagQuota("You used up your daily limit"), true);
  assert.equal(isDagQuota("14006 iets"), false);
});

t("isDagQuota: neurons + exhausted in beide volgordes", () => {
  assert.equal(isDagQuota("neurons exhausted"), true);
  assert.equal(isDagQuota("exhausted all neurons"), true);
  assert.equal(isDagQuota("neurons exceeded for today"), true);
  assert.equal(isDagQuota("exceeded your neuron budget"), true);
});

t("isDagQuota: gewone 429 en onbekende fouten zijn geen dagquota", () => {
  assert.equal(isDagQuota(new Error("429 Too Many Requests")), false);
  assert.equal(isDagQuota("rate limit"), false);
  assert.equal(isDagQuota("boom"), false);
  assert.equal(isDagQuota(undefined), false);
});

t("isTijdelijk: 429, rate limit, too many requests, overloaded, 3040, time-out", () => {
  for (const m of ["HTTP 429", "Rate limit hit", "rate-limit", "Too Many Requests", "model overloaded", "3040: capacity temporarily exceeded", "request timed out", "timeout", "time-out"]) assert.equal(isTijdelijk(m), true, m);
  assert.equal(isTijdelijk("4290"), false);
  assert.equal(isTijdelijk("kapot"), false);
});

t("isTijdelijk: dagquota gaat voor tijdelijk", () => {
  const m = "429: 4006 you have used up your daily free allocation";
  assert.equal(isDagQuota(m), true);
  assert.equal(isTijdelijk(m), false);
});

t("aiFout: dagquota, tijdelijk en overig", () => {
  assert.equal(aiFout("4006 daily free allocation"), "dagquota");
  assert.equal(aiFout("429"), "tijdelijk");
  assert.equal(aiFout("overloaded"), "tijdelijk");
  assert.equal(aiFout("4006 en 429"), "dagquota");
  assert.equal(aiFout("onbekende fout"), "overig");
});

t("aiFout: Error, string, object met message en undefined", () => {
  assert.equal(aiFout(new Error("timed out")), "tijdelijk");
  assert.equal(aiFout("rate limit"), "tijdelijk");
  assert.equal(aiFout({ message: "4006" }), "dagquota");
  assert.equal(aiFout({ message: "iets anders" }), "overig");
  assert.equal(aiFout({}), "overig");
  assert.equal(aiFout(undefined), "overig");
  assert.equal(aiFout(null), "overig");
});

t("neuronFactor: leeg of undefined geeft 1", () => {
  assert.equal(neuronFactor(), 1);
  assert.equal(neuronFactor(undefined), 1);
  assert.equal(neuronFactor(""), 1);
});

t("neuronFactor: getal en numerieke string, begrensd op 0,5 tot 5", () => {
  assert.equal(neuronFactor(2), 2);
  assert.equal(neuronFactor("1.5"), 1.5);
  assert.equal(neuronFactor(" 3 "), 3);
  assert.equal(neuronFactor(0.1), 0.5);
  assert.equal(neuronFactor("100"), 5);
});

t("neuronFactor: 0, negatief en ongeldig geven 1", () => {
  assert.equal(neuronFactor(0), 1);
  assert.equal(neuronFactor("0"), 1);
  assert.equal(neuronFactor(-2), 1);
  assert.equal(neuronFactor("abc"), 1);
  assert.equal(neuronFactor(NaN), 1);
  assert.equal(neuronFactor(Infinity), 1);
});

t("schatTokens: lege string 0, naar boven afgerond bij 3,5 tekens per token", () => {
  assert.equal(schatTokens(""), 0);
  assert.equal(schatTokens("a"), 1);
  assert.equal(schatTokens("a".repeat(7)), 2);
  assert.equal(schatTokens("a".repeat(8)), 3);
  assert.equal(schatTokens("a".repeat(35)), 10);
});

console.log(`${n} tests ok`);
