import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

for (const naam of readdirSync("docs").filter((bestand) => bestand.endsWith(".md"))) {
  const bestand = `docs/${naam}`;
  const inhoud = readFileSync(bestand, "utf8");
  for (const match of inhoud.matchAll(/\]\(([^)]+)\)/g)) {
    const doel = match[1].split("#")[0];
    if (!doel || /^[a-z]+:\/\//i.test(doel) || doel.startsWith("mailto:")) continue;
    assert.ok(existsSync(resolve(dirname(bestand), doel)), `${bestand}: ontbrekend pad ${doel}`);
  }
}
console.log("✓ Lokale documentatielinks verwijzen naar bestaande paden");
