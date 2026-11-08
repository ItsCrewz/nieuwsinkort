import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const script = `
import json, sys
sys.path.insert(0, "scripts/pipeline")
from ontdubbel import ontdubbel
with open("tests/fixtures/ontdubbel/invoer.json") as f:
    invoer = json.load(f)
print(json.dumps(ontdubbel(invoer["lijst"], invoer["tegen"]), ensure_ascii=False, indent=2))
`;
const resultaat = spawnSync("python3", ["-c", script], { encoding: "utf8" });
assert.equal(resultaat.status, 0, resultaat.stderr);
assert.equal(resultaat.stdout, readFileSync("tests/fixtures/ontdubbel/verwacht.json", "utf8"));
console.log("Pipeline-ontdubbeling komt overeen met de vastgelegde uitvoer.");
