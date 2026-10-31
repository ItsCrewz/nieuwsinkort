// Een ontbrekend /assets-bestand mag geen SPA-HTML met immutable-cache worden (#423, vervolg #419).
// Pages schakelt de SPA-fallback uit zodra public/404.html bestaat; dan geeft /assets/bestaat-niet.css een 404.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const kop = readFileSync("public/_headers", "utf8");
const routes = JSON.parse(readFileSync("public/_routes.json", "utf8"));

assert.ok(existsSync("public/404.html"), "public/404.html moet bestaan: zonder die draait Pages de SPA-fallback (200 + HTML)");
const f404 = readFileSync("public/404.html", "utf8");
const index = readFileSync("index.html", "utf8");
assert.ok(f404.length < 1000 && !f404.includes("<script") && !f404.includes("/assets/"), "404.html is een kleine statische pagina");
assert.notEqual(f404, index, "404.html is niet de SPA-index");
// Bij een 404 zonder SPA-fallback kan een ontbrekende naam nooit als 200 text/html met 1 jaar cache terugkomen.
assert.match(kop, /^\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable/m);
assert.ok(routes.exclude.includes("/assets/*"), "/assets/* blijft buiten de Functions (gratis quotum)");
console.log("✓ ontbrekend /assets-bestand krijgt 404 (geen SPA-fallback), 404.html aanwezig en klein");
