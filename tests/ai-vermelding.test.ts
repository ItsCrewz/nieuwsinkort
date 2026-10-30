import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// #349: de AI-vermelding staat alleen in de footer, niet meer bij samenvattingen.
const bestanden = (map: string): string[] => readdirSync(map, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? bestanden(join(map, d.name)) : [join(map, d.name)]));
for (const f of bestanden("src").filter((p) => /\.(tsx?|css)$/.test(p))) {
  const tekst = readFileSync(f, "utf8");
  assert.ok(!tekst.includes("Samenvatting gemaakt met AI"), `${f} bevat nog de vermelding`);
  assert.ok(!/ai-vermelding|AiVermelding/.test(tekst), `${f} verwijst nog naar AiVermelding`);
}
const app = readFileSync("src/App.tsx", "utf8");
assert.match(app, /<footer className="foot">[\s\S]*Samenvattingen op nieuwsinkort worden gemaakt met AI en kunnen fouten bevatten\. Lees bij twijfel altijd de bron\.[\s\S]*<\/footer>/);
