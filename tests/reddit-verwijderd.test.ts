import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const verboden = /(?:^|\.)(?:reddit\.com|red\.artemislena\.eu|safereddit\.com|redlib\.privadency\.com|redlib\.4o1x5\.dev|redlib\.privacyredirect\.com|redlib\.catsarch\.com|l\.opnxng\.com|redlib\.nadeko\.net|redlib\.ducks\.party)$/i;
for (const bestand of ["scripts/pipeline/feeds.json", "scripts/pipeline/feeds_detail.json", "public/bronnen.json"]) {
  const data = JSON.parse(readFileSync(bestand, "utf8"));
  const urls: string[] = [];
  const verzamel = (v: unknown): void => {
    if (typeof v === "string" && /^https?:\/\//.test(v)) urls.push(v);
    else if (Array.isArray(v)) v.forEach(verzamel);
    else if (v && typeof v === "object") Object.values(v).forEach(verzamel);
  };
  verzamel(data);
  for (const url of urls) assert.equal(verboden.test(new URL(url).hostname), false, url);
}
for (const bestand of readdirSync("worker/src").filter((naam) => naam.endsWith(".ts"))) {
  assert.doesNotMatch(readFileSync(`worker/src/${bestand}`, "utf8"), /Feedly/i, bestand);
}
assert.doesNotMatch(readFileSync("scripts/pipeline/filmpjes.py", "utf8"), /reddit|redd(?:\\?\.)it/i);
assert.doesNotMatch(readFileSync("scripts/build-bronnen.mjs", "utf8"), /reddit/i);
console.log("✓ Reddit- en Redlib-bronnen en Feedly-UA blijven verwijderd");
