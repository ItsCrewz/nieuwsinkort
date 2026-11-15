// Controleert dat bestandspaden, npm-scripts en ankers in README, AGENTS, CLAUDE en docs/ naar iets bestaands wijzen.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

const root = process.cwd();
// Historische documenten en gegenereerde bestanden blijven buiten beschouwing.
const docs = ["README.md", "AGENTS.md", "CLAUDE.md", "scripts/pipeline/README.md",
  ...readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md") && !/^codebase-review-|^regressie-joey/.test(f)).map((f) => `docs/${f}`)]
  .filter((f) => existsSync(join(root, f)));
// Bewust genoemd maar niet in git: build-uitvoer, runtime-paden en lokale cache.
const UITZONDERING = /^(dist\/|assets\/index-|coverage\/|\/tmp\/|\/workspace\/|node_modules\/|scripts\/\.cache\/|\.wrangler\/|\.dev\.vars|\.env)/;
const EXT = /\.(ts|tsx|mts|mjs|js|json|md|py|toml|sh|css|html|yml|yaml|txt|spec\.mjs)$/;

const tekst = (f: string) => readFileSync(join(root, f), "utf8").replace(/```[\s\S]*?```/g, "");
const slug = (kop: string) => kop.toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-");
const ankers = (f: string) => new Set([...readFileSync(join(root, f), "utf8").matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])));

t("bestandspaden in backticks bestaan", () => {
  const fout: string[] = [];
  for (const f of docs) {
    for (const m of tekst(f).matchAll(/`([^`\s]+)`/g)) {
      const p = m[1].replace(/[:,.;)]+$/, "").replace(/:\d+$/, "");
      if (!p.includes("/") || !EXT.test(p) || /[*<>{}\[\]$|]|^https?:|^\.\.\.|^\/(?!tmp|workspace)/.test(p) || UITZONDERING.test(p)) continue;
      const kandidaten = [join(root, p), join(root, dirname(f), p)];
      if (!kandidaten.some((k) => existsSync(k))) fout.push(`${f}: ${p}`);
    }
  }
  assert.deepEqual(fout, []);
});

t("npm run <naam> bestaat in package.json", () => {
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts as Record<string, string>;
  const fout: string[] = [];
  for (const f of docs) for (const m of tekst(f).matchAll(/npm run ([a-z][\w:-]*)/g)) if (!(m[1] in scripts)) fout.push(`${f}: npm run ${m[1]}`);
  assert.deepEqual(fout, []);
});

t("markdown-ankers wijzen naar een bestaande kop", () => {
  const fout: string[] = [];
  for (const f of docs) {
    for (const m of tekst(f).matchAll(/\]\(([^)\s#]*)#([^)\s]+)\)/g)) {
      if (/^https?:/.test(m[1])) continue;
      const doel = m[1] ? join(dirname(f), m[1]).replace(/\\/g, "/") : f;
      if (!existsSync(join(root, doel))) { fout.push(`${f}: ${m[1]} ontbreekt`); continue; }
      if (!ankers(doel).has(m[2])) fout.push(`${f}: ${m[1]}#${m[2]}`);
    }
  }
  assert.deepEqual(fout, []);
});

console.log(`${n} tests`);
