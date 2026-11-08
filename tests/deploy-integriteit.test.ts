// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const resultaat = fn();
  if (resultaat instanceof Promise) return resultaat.then(klaar);
  klaar();
};

t("deploy-integriteit: vuile werkboom vereist expliciete uitzondering", () => {
  const script = readFileSync("deploy.sh", "utf8");
  const controle = script.slice(script.indexOf('COMMIT="'), script.indexOf("# --- doel-branch"));
  // eigen wegwerp-repo met een ongecommit bestand, zodat de uitkomst niet van de echte werkboom afhangt
  const dir = mkdtempSync(join(tmpdir(), "nik-vuil-"));
  const git = (...a: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "start");
  writeFileSync(join(dir, "vuil.txt"), "x");
  const draai = (allow: string) => spawnSync("bash", ["-ec", controle], { cwd: dir, env: { ...process.env, ALLOW_DIRTY: allow }, encoding: "utf8" });
  const vuil = draai("");
  assert.equal(vuil.status, 1);
  assert.match(vuil.stderr, /vuile werkboom/);
  assert.equal(draai("1").status, 0);
  rmSync(dir, { recursive: true, force: true });
  assert.ok(script.includes("git diff --exit-code HEAD -- public/bronnen.json"));
  assert.ok(script.includes('--commit-hash "$COMMIT"'));
});

await t("build: repo-invoer, stabiele bronnen en versieherkomst", async () => {
  const uitvoeren = promisify(execFile);
  const dir = mkdtempSync(join(tmpdir(), "nik-integriteit-"));
  try {
    for (const map of ["scripts/pipeline", "public", "dist"]) mkdirSync(join(dir, map), { recursive: true });
    for (const bestand of ["build-bronnen.mjs", "build-version.mjs"]) copyFileSync(`scripts/${bestand}`, join(dir, "scripts", bestand));
    writeFileSync(join(dir, "scripts/pipeline/feeds.json"), JSON.stringify([{ naam: "Testbron", cat: "nl", werkt: true, url: "https://example.org/rss" }]));
    const env = { ...process.env, FEEDS_JSON: "", FILMPJES_PY: "" };
    const bouw = () => uitvoeren("node", ["scripts/build-bronnen.mjs"], { cwd: dir, env });
    await bouw();
    const bronnen = readFileSync(join(dir, "public/bronnen.json"), "utf8");
    assert.equal(JSON.parse(bronnen).groepen[0].bronnen[0].naam, "Testbron");
    await bouw();
    assert.equal(readFileSync(join(dir, "public/bronnen.json"), "utf8"), bronnen);
    assert.match(readFileSync("scripts/build-bronnen.mjs", "utf8"), /console.warn.*buiten de repo/);
    const gitMap = (await uitvoeren("git", ["rev-parse", "--absolute-git-dir"])).stdout.trim();
    writeFileSync(join(dir, ".git"), `gitdir: ${gitMap}\n`);
    await uitvoeren("node", ["scripts/build-version.mjs"], { cwd: dir });
    const versie = JSON.parse(readFileSync(join(dir, "dist/version.json"), "utf8"));
    assert.equal(versie.commit, (await uitvoeren("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" })).stdout.trim());
    assert.equal(versie.bronnenSha256, createHash("sha256").update(bronnen).digest("hex"));
    assert.ok(Number.isFinite(Date.parse(versie.datum)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${n} tests geslaagd`);
