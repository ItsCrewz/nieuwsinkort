#!/usr/bin/env node
// Haalt DATUM, DAG_SAMENVATTING, WEER, FILMPJES, DUMPERT en ITEMS uit de canvas-broncode
// en schrijft public/data.json.
// Gebruik: node export_from_canvas.mjs <canvas-bron.txt> [uitvoer.json]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , input, outArg] = process.argv;
if (!input) {
  console.error("Gebruik: node export_from_canvas.mjs <canvas-bron.txt> [uitvoer.json]");
  process.exit(1);
}
const out = outArg || path.join(here, "public", "data.json");
const src = fs.readFileSync(input, "utf8");

// Vind het einde van een expressie: eerste ';' op top-niveau buiten strings/haakjes.
function exprEnd(s, i) {
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === "\\") i++;
        i++;
      }
    } else if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
    } else if (c === "/" && s[i + 1] === "*") {
      i = s.indexOf("*/", i + 2) + 1;
    } else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === ";" && depth === 0) return i;
    i++;
  }
  throw new Error("Geen einde gevonden");
}

// Zoekt `const|let|var NAAM [: Type] = ...` (ook met `export`), slaat een eventuele
// type-annotatie over (die mag zelf `=>`, `<...>`, `{...}` bevatten) en geeft de
// waarde terug. Ontbreekt een optionele constante, dan komt de standaardwaarde terug.
function extract(name, fallback) {
  const re = new RegExp(`^[ \\t]*(?:export\\s+)?(?:const|let|var)\\s+${name}\\b`, "m");
  const m = re.exec(src);
  if (!m) {
    if (fallback !== undefined) {
      warnings.push(`${name} ontbreekt in de bron, standaard ${JSON.stringify(fallback)} gebruikt`);
      return fallback;
    }
    throw new Error(`Constante ${name} niet gevonden`);
  }
  // Zoek de '=' van de toewijzing op top-niveau (niet '=>' of '==' in een type).
  let i = m.index + m[0].length, depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if ("([{<".includes(c)) depth++;
    else if (")]}>".includes(c) && src[i - 1] !== "=") depth--;
    else if (c === "=" && depth === 0 && src[i + 1] !== ">" && src[i + 1] !== "=") break;
    else if (c === ";" && depth === 0) throw new Error(`Constante ${name} heeft geen waarde`);
  }
  const start = i + 1;
  const end = exprEnd(src, start);
  let code = src.slice(start, end).trim();
  // TypeScript-staartjes weghalen: `as const`, `as Type`, `satisfies Type`.
  code = code.replace(/\s+(?:as\s+const|as\s+[A-Za-z_$][\w$.<>\[\], |]*|satisfies\s+[A-Za-z_$][\w$.<>\[\], |]*)\s*$/, "");
  // Alleen data-literals: evalueren in een lege sandbox zonder globals.
  return vm.runInNewContext(`(${code})`, Object.create(null), { timeout: 2000 });
}

const warnings = [];
const data = {
  datum: extract("DATUM"),
  dag_samenvatting: extract("DAG_SAMENVATTING", ""),
  weer: extract("WEER", {}),
  filmpjes: extract("FILMPJES", []),
  dumpert: extract("DUMPERT", []),
  items: extract("ITEMS"),
  gegenereerd: new Date().toISOString(),
};
for (const w of warnings) console.warn("Let op: " + w);

// Basiscontrole van de vormen
if (typeof data.datum !== "string") throw new Error("datum ongeldig");
for (const k of ["filmpjes", "dumpert", "items"]) {
  if (!Array.isArray(data[k])) throw new Error(`${k} is geen lijst`);
}
for (const it of data.items) {
  if (!it.cat || !it.kop || !Array.isArray(it.bronnen)) throw new Error(`Ongeldig item: ${it.kop}`);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(data, null, 1) + "\n");
const per = {};
for (const it of data.items) per[it.cat] = (per[it.cat] || 0) + 1;
console.log(
  `Geschreven: ${out}\n  datum: ${data.datum}\n  items: ${data.items.length} ${JSON.stringify(per)}\n  filmpjes: ${data.filmpjes.length}\n  dumpert: ${data.dumpert.length}\n  weer: ${data.weer?.nu?.temp ?? "?"}° (${data.weer?.bijgewerkt ?? "?"})`
);

// Dumpert: elk item een afspeelbare stream geven (of weglaten als het geen video is).
try {
  execFileSync(process.execPath, [path.join(here, "scripts", "fix-dumpert.mjs"), out], { stdio: "inherit", timeout: 120000 });
} catch (e) {
  console.warn("Let op: fix-dumpert mislukt:", e?.message || e);
}
