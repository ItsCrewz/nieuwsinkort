// Na `vite build`: verwijs zonder JavaScript naar de actuele serverpagina (#313).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { metNoscript, noscriptHtml } from "./noscript-html.mjs";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const pad = join(dist, "index.html");
if (!existsSync(pad)) throw new Error("build-noscript: dist/index.html ontbreekt");
const html = readFileSync(pad, "utf8");
if (!html.includes("<noscript>")) throw new Error("build-noscript: geen <noscript> in index.html");
writeFileSync(pad, metNoscript(html, noscriptHtml()));
