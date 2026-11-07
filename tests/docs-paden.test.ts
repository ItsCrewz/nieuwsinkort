import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const bestanden = ["README.md", "AGENTS.md", "CLAUDE.md", ...readdirSync("docs").filter((naam) => naam.endsWith(".md")).map((naam) => `docs/${naam}`)];
const scripts = Object.keys(JSON.parse(readFileSync("package.json", "utf8")).scripts);

function ankers(inhoud: string): Set<string> {
  const gevonden = new Set<string>();
  const aantallen = new Map<string, number>();
  for (const match of inhoud.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const basis = match[1].replace(/<[^>]*>/g, "").replace(/[`*_~]/g, "").toLowerCase()
      .replace(/[^\p{L}\p{N}_\- ]/gu, "").replace(/ /g, "-");
    const aantal = aantallen.get(basis) || 0;
    aantallen.set(basis, aantal + 1);
    gevonden.add(aantal ? `${basis}-${aantal}` : basis);
  }
  for (const match of inhoud.matchAll(/<a\s+id=["']([^"']+)["']/g)) gevonden.add(match[1]);
  return gevonden;
}

for (const bestand of bestanden) {
  const inhoud = readFileSync(bestand, "utf8");
  for (const match of inhoud.matchAll(/\]\(([^)]+)\)/g)) {
    const link = match[1];
    if (/^(?:[a-z]+:\/\/|mailto:)/i.test(link)) continue;
    const [pad, anker] = link.split("#");
    const doel = pad ? resolve(dirname(bestand), decodeURIComponent(pad)) : resolve(bestand);
    assert.ok(existsSync(doel), `${bestand}: ontbrekend pad ${link}`);
    if (anker) assert.ok(ankers(readFileSync(doel, "utf8")).has(decodeURIComponent(anker)), `${bestand}: ontbrekend anker ${link}`);
  }
  for (const match of inhoud.matchAll(/`([^`\n]+)`/g)) {
    const code = match[1];
    for (const script of code.matchAll(/\bnpm run ([\w:-]+)/g)) {
      assert.ok(scripts.includes(script[1]), `${bestand}: onbekend npm-script ${script[1]}`);
    }
    for (const pad of code.matchAll(/(?:^|\s)((?:\.\/)?(?:src|worker|functions|scripts|tests|docs|public|changelog\.d|e2e)\/[\w.\-/]+)(?=$|\s)/g)) {
      if (pad[1] === "scripts/.cache/" || (bestand === "docs/codebase-review-20261030.md" && ["src/netwerk.ts", "src/soort.ts", "worker/src/ua.ts", "src/videosamenvatting.tsx", "src/weer-ui.tsx", "src/nieuwslijst.tsx", "src/nieuwsfeed.tsx", "src/usedata.ts", "src/thema.ts", "worker/src/jobs.ts", "worker/src/auth.ts", "worker/src/leesverder.ts", "worker/src/ai-trap.ts"].includes(pad[1]))) continue; // Cache en historische bevinding.
      assert.ok((existsSync(pad[1]) || existsSync(`${pad[1]}.ts`) || existsSync(`${pad[1]}.tsx`)), `${bestand}: ontbrekend codepad ${pad[1]}`);
    }
  }
}
console.log("✓ Documentatielinks, ankers, codepaden en npm-scripts bestaan");
