import assert from "node:assert/strict";
import { midnight } from "../src/tijd";

const gevallen = [
  ["voor de zomertijdwisseldag", "2026-03-28T22:59:59.999Z", "2026-03-27T23:00:00Z"],
  ["middernacht op de zomertijdwisseldag", "2026-03-28T23:00:00.000Z", "2026-03-28T23:00:00Z"],
  ["na middernacht op de zomertijdwisseldag", "2026-03-28T23:00:00.001Z", "2026-03-28T23:00:00Z"],
  ["vlak voor de zomertijdwissel", "2026-03-29T00:59:59.999Z", "2026-03-28T23:00:00Z"],
  ["bij de zomertijdwissel", "2026-03-29T01:00:00.000Z", "2026-03-28T23:00:00Z"],
  ["voor het einde van de zomertijdwisseldag", "2026-03-29T21:59:59.999Z", "2026-03-28T23:00:00Z"],
  ["middernacht na de zomertijdwisseldag", "2026-03-29T22:00:00.000Z", "2026-03-29T22:00:00Z"],
  ["na de zomertijdwisseldag", "2026-03-29T22:00:00.001Z", "2026-03-29T22:00:00Z"],
  ["voor de wintertijdwisseldag", "2026-10-24T21:59:59.999Z", "2026-10-23T22:00:00Z"],
  ["middernacht op de wintertijdwisseldag", "2026-10-24T22:00:00.000Z", "2026-10-24T22:00:00Z"],
  ["na middernacht op de wintertijdwisseldag", "2026-10-24T22:00:00.001Z", "2026-10-24T22:00:00Z"],
  ["vlak voor de wintertijdwissel", "2026-10-25T00:59:59.999Z", "2026-10-24T22:00:00Z"],
  ["bij de wintertijdwissel", "2026-10-25T01:00:00.000Z", "2026-10-24T22:00:00Z"],
  ["voor het einde van de wintertijdwisseldag", "2026-10-25T22:59:59.999Z", "2026-10-24T22:00:00Z"],
  ["middernacht na de wintertijdwisseldag", "2026-10-25T23:00:00.000Z", "2026-10-25T23:00:00Z"],
  ["na de wintertijdwisseldag", "2026-10-25T23:00:00.001Z", "2026-10-25T23:00:00Z"],
];

for (const [naam, tijd, begin] of gevallen) {
  assert.equal(midnight(Date.parse(tijd)), Date.parse(begin), naam);
  console.log("✓", naam);
}