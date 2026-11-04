// Na `vite build`: vult <noscript> in dist/index.html met de dagsamenvatting en de eerste 10 koppen (met bronlink) uit dist/data.json (#313).
// Met JavaScript wordt <noscript> niet gerenderd: geen CLS of hydration. Ontbreekt of faalt data.json, dan blijft de kale pagina met /vandaag-link.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { metNoscript, noscriptHtml } from "./noscript-html.mjs";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
let data = null;
try { data = JSON.parse(readFileSync(join(dist, "data.json"), "utf8")); } catch { console.warn("build-noscript: data.json onleesbaar, kale noscript"); }
const pad = join(dist, "index.html");
if (!existsSync(pad)) throw new Error("build-noscript: dist/index.html ontbreekt");
const html = readFileSync(pad, "utf8");
if (!html.includes("<noscript>")) throw new Error("build-noscript: geen <noscript> in index.html");
writeFileSync(pad, metNoscript(html, noscriptHtml(data)));
