import { build } from "esbuild";
import { readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// ook tests/regressie/*.test.ts (regressietests bij gemelde bugs, bevroren fixtures in tests/fixtures/joey/)
const bestanden = [...(await readdir("tests")).filter((naam) => naam.endsWith(".test.ts")), ...(await readdir("tests/regressie").catch(() => [])).filter((naam) => naam.endsWith(".test.ts")).map((naam) => `regressie/${naam}`)].sort();
const tijdelijk = await mkdtemp(join(tmpdir(), "nieuwsinkort-tests-"));
let mislukt = false;
try {
  for (const bestand of bestanden) {
    console.log(`\n${bestand}`);
    const uitvoer = join(tijdelijk, `${bestand.replace("/", "-")}.mjs`);
    try {
      await build({
        entryPoints: [join("tests", bestand)],
        bundle: true,
        platform: "node",
        format: "esm",
        alias: { "cloudflare:workers": "./tests/worker-mock.ts" },
        outfile: uitvoer,
        logLevel: "warning",
      });
      const resultaat = spawnSync(process.execPath, [uitvoer], { stdio: "inherit" });
      if (resultaat.error || resultaat.status !== 0) {
        if (resultaat.error) console.error(resultaat.error);
        mislukt = true;
      }
    } catch (fout) {
      console.error(`Bundelen van ${bestand} mislukt:`, fout);
      mislukt = true;
    }
  }
} finally {
  await rm(tijdelijk, { recursive: true, force: true });
}
if (mislukt) process.exitCode = 1;
