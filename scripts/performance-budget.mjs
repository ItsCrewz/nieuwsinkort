import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const budget = JSON.parse(await readFile(new URL("./performance-budget.json", import.meta.url), "utf8"));
const html = await readFile("dist/index.html", "utf8");
const script = html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/);
if (!script) throw new Error("Hoofdscript ontbreekt in dist/index.html");
const bestanden = await readdir("dist/assets");
// De CSS staat inline in index.html (#403) én als bestand naast de pagina (#419); het bestand geldt als maat.
// Beweging-CSS staat apart (uitgesteld.css, na eerste paint geladen); alleen de kritieke CSS telt voor het harde budget.
const alleCss = bestanden.filter((b) => b.endsWith(".css"));
const styles = alleCss.filter((b) => !b.startsWith("uitgesteld-")).map((b) => [null, `/assets/${b}`]);
const uitgesteld = alleCss.filter((b) => b.startsWith("uitgesteld-")).map((b) => [null, `/assets/${b}`]);
if (styles.length === 0) throw new Error("CSS-bestand ontbreekt in dist/assets");
if (uitgesteld.length !== 1) throw new Error("Uitgesteld CSS-bestand (uitgesteld-*.css) ontbreekt of is niet uniek in dist/assets");
async function grootte(url) {
  if (!/^\/assets\/[^/]+$/.test(url) || !bestanden.includes(url.slice(8))) throw new Error(`Ongeldig buildbestand: ${url}`);
  return gzipSync(await readFile(`dist${url}`), { level: 9 }).length;
}
const js = await grootte(script[1]);
const css = (await Promise.all(styles.map((m) => grootte(m[1])))).reduce((a, b) => a + b, 0);
const uitgesteldCss = await grootte(uitgesteld[0][1]);
console.log(`Hoofd-JS: ${js} bytes gzip (maximaal ${budget.hoofdJsGzipBytes}); kritieke CSS: ${css} bytes gzip (maximaal ${budget.cssGzipBytes}); uitgestelde CSS: ${uitgesteldCss} bytes gzip (maximaal ${budget.uitgesteldCssGzipBytes}).`);
if (js > budget.hoofdJsGzipBytes || css > budget.cssGzipBytes || uitgesteldCss > budget.uitgesteldCssGzipBytes) process.exitCode = 1;
