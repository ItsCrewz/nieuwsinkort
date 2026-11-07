// Gesplitste CSS (css-kritiek): kritieke CSS binnen budget, beweging-CSS apart, gehasht en niet render-blokkerend. Draai: npm test
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const budget = JSON.parse(readFileSync("scripts/performance-budget.json", "utf8"));
assert.equal(budget.cssGzipBytes, 12288, "het kritieke CSS-budget gaat niet omhoog");
assert.equal(budget.uitgesteldCssGzipBytes, 8192);

const dir = mkdtempSync(join(tmpdir(), "nik-csskritiek-"));
try {
  const r = spawnSync("node_modules/.bin/vite", ["build", "--outDir", dir, "--emptyOutDir"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const css = readdirSync(join(dir, "assets")).filter((f) => f.endsWith(".css"));
  const uitgesteld = css.filter((f) => f.startsWith("uitgesteld-"));
  const kritiek = css.filter((f) => !f.startsWith("uitgesteld-"));
  assert.equal(uitgesteld.length, 1, "precies één uitgesteld CSS-bestand");
  assert.equal(kritiek.length, 1, "precies één kritiek CSS-bestand");
  assert.match(uitgesteld[0], /^uitgesteld-[\w-]{8}-s419\.css$/, "gehashte asset (immutable cache via /assets/*)");
  const lees = (f: string) => readFileSync(join(dir, "assets", f), "utf8");
  const k = lees(kritiek[0]), u = lees(uitgesteld[0]);
  const gz = (s: string) => gzipSync(s, { level: 9 }).length;
  assert.ok(gz(k) <= 12288, `kritieke CSS ${gz(k)} B gzip > 12288`);
  assert.ok(gz(u) <= 8192, `uitgestelde CSS ${gz(u)} B gzip > 8192`);
  // de motion-regels staan alleen in het uitgestelde bestand
  for (const m of ["@keyframes svup", "@keyframes slo", "@keyframes mni", "::view-transition-old(root)", "view-transition-name:topbalk", "transition:"]) {
    assert.ok(u.includes(m), `uitgesteld mist ${m}`);
  }
  for (const m of ["@keyframes svup", "@keyframes slo", "@keyframes mni", "@keyframes glans", "view-transition", "transition:transform", "transition:opacity"]) {
    assert.ok(!k.includes(m), `kritiek bevat ${m}`);
  }
  // layout-/intro-regels blijven kritiek, reduced motion ook
  for (const m of ["@keyframes up", "@keyframes fadein", "@keyframes kaart-in", ".nc.wacht", "prefers-reduced-motion:reduce"]) assert.ok(k.includes(m), `kritiek mist ${m}`);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  assert.ok(!html.includes("@keyframes svup") && !html.includes(uitgesteld[0]), "index.html verwijst niet naar de uitgestelde CSS en bevat hem niet inline");
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(html));
  console.log(`✓ css-kritiek: kritiek ${gz(k)} B gzip, uitgesteld ${gz(u)} B gzip`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
