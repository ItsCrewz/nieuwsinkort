// Leg de herkomst van de build vast zonder netwerkverzoeken.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const { stdout } = await promisify(execFile)("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
const commit = stdout.trim();
const bronnenSha256 = createHash("sha256").update(readFileSync("public/bronnen.json")).digest("hex");
writeFileSync("dist/version.json", JSON.stringify({ commit, datum: new Date().toISOString(), bronnenSha256 }) + "\n");
