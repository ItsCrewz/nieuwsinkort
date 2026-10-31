// Bouwt naar een tijdelijke map en controleert dat elk genoemd /assets-bestand bestaat (#419) en de CSS niet render-blokkerend is.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "nik-build-"));
try {
  const r = spawnSync("node_modules/.bin/vite", ["build", "--outDir", dir, "--emptyOutDir"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const js = readdirSync(join(dir, "assets")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(dir, "assets", f), "utf8"));
  const genoemd = new Set<string>();
  for (const tekst of [html, ...js]) for (const m of tekst.matchAll(/assets\/[\w.-]+\.\w+/g)) genoemd.add(m[0]);
  assert.ok(genoemd.size > 0);
  for (const p of genoemd) assert.ok(existsSync(join(dir, p)), `${p} wordt genoemd maar ontbreekt in de build`);
  const css = readdirSync(join(dir, "assets")).filter((f) => f.endsWith(".css"));
  assert.ok(css.length > 0, "er moet een CSS-bestand in dist/assets staan");
  assert.ok(!css.includes("index-D0ggz26B.css") && !css.includes("index-D0ggz26B-c.css"), "oude CSS-namen zijn door de edge als HTML gecachet (#419)");
  assert.ok(css.every((f) => /-s419\.css$/.test(f)), "CSS volgt het naampatroon -[hash]-s419.css");
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(html), "index.html mag geen render-blokkerende stylesheet-link hebben");
  assert.match(html, /<style>/);
  console.log("✓ build: genoemde assets bestaan, CSS inline zonder stylesheet-link");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
