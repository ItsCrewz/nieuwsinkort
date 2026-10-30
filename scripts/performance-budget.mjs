import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const budget = JSON.parse(await readFile(new URL("./performance-budget.json", import.meta.url), "utf8"));
const html = await readFile("dist/index.html", "utf8");
const script = html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/);
const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)];
if (!script || styles.length === 0) throw new Error("Hoofdscript of stylesheet ontbreekt in dist/index.html");
const bestanden = await readdir("dist/assets");
async function grootte(url) {
  if (!/^\/assets\/[^/]+$/.test(url) || !bestanden.includes(url.slice(8))) throw new Error(`Ongeldig buildbestand: ${url}`);
  return gzipSync(await readFile(`dist${url}`), { level: 9 }).length;
}
const js = await grootte(script[1]);
const css = (await Promise.all(styles.map((m) => grootte(m[1])))).reduce((a, b) => a + b, 0);
console.log(`Hoofd-JS: ${js} bytes gzip (maximaal ${budget.hoofdJsGzipBytes}); CSS: ${css} bytes gzip (maximaal ${budget.cssGzipBytes}).`);
if (js > budget.hoofdJsGzipBytes || css > budget.cssGzipBytes) process.exitCode = 1;
