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
  const linktekst = inhoud.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, "").replace(/`[^`\n]*`/g, "");
  const definities = new Map([...linktekst.matchAll(/^\[([^\]]+)\]:\s*(\S+)/gm)].map((m) => [m[1].toLowerCase(), m[2]]));
  const links = [...linktekst.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
  for (const match of linktekst.matchAll(/(?<!!)\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
    const naam = (match[2] || match[1]).toLowerCase();
    assert.ok(definities.has(naam), `${bestand}: ontbrekende linkdefinitie ${naam}`);
    links.push(definities.get(naam)!);
  }
  for (const link of links) {
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
      if (pad[1] === "scripts/.cache/") {
        assert.match(readFileSync(".gitignore", "utf8"), /(?:^|\n)\s*(?:\/)?scripts\/\.cache\/?\s*(?:\n|$)/);
        continue; // De cache wordt lokaal gegenereerd en niet ingecheckt.
      }
      assert.ok((existsSync(pad[1]) || existsSync(`${pad[1]}.ts`) || existsSync(`${pad[1]}.tsx`)), `${bestand}: ontbrekend codepad ${pad[1]}`);
    }
  }
}
console.log("✓ Documentatielinks, ankers, codepaden en npm-scripts bestaan");

// Worker-routes staan in de router; Pages leidt routes af uit bestandsnamen.
const workerRouter = readFileSync("worker/src/index.ts", "utf8");
for (const route of ["/run", "/uur"]) {
  assert.ok(workerRouter.includes(`u.pathname === "${route}"`), `ontbrekende Worker-route ${route}`);
}
assert.ok(existsSync("functions/samenvatting.ts"), "ontbrekende Pages-route /samenvatting");
