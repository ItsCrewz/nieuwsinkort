import { build } from "esbuild";
import { readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const bestanden = (await readdir("tests")).filter((naam) => naam.endsWith(".test.ts")).sort();
const tijdelijk = await mkdtemp(join(tmpdir(), "nieuwsinkort-tests-"));
let mislukt = false;
try {
  for (const bestand of bestanden) {
    console.log(`\n${bestand}`);
    const uitvoer = join(tijdelijk, `${bestand}.mjs`);
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
