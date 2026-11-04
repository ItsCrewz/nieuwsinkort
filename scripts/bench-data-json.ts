// Lokale meting van de volledige Pages-handler met de incidentbestanden.
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { onRequestGet } from "../functions/data.json";

const uur = readFileSync("/workspace/logs/nik368-uur-sample.json", "utf8");
const stat = readFileSync("/workspace/logs/nik368-statisch-sample.json", "utf8");
Date.now = () => Date.parse("2026-10-30T21:05:00Z");
const env = { ASSETS: { fetch: async () => new Response(stat) }, NIEUWS: { get: async (key: string, _type: "json") => key === "uur" ? JSON.parse(uur) : null } };
const tijden: number[] = [];
for (let i = 0; i < 25; i++) {
  const begin = performance.now();
  await (await onRequestGet({ request: new Request("https://test/data.json"), env })).text();
  if (i >= 5) tijden.push(performance.now() - begin);
}
tijden.sort((a, b) => a - b);
console.log(`Mediaan 20 volledige aanvragen: ${((tijden[9] + tijden[10]) / 2).toFixed(2)} ms`);
