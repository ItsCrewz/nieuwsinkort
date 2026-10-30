// Voegt fragmenten uit changelog.d/ samen onder "## Onuitgebracht" in CHANGELOG.md en verwijdert ze.
// Handmatig draaien door de coördinator vóór een release (niet in deploy.sh): npm run changelog [-- --dry]
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KOP = "## Onuitgebracht";

// Pure kern (getest): fragmenten zijn { naam, tekst }, gesorteerd op naam voor een stabiele volgorde.
export function voegSamen(changelog, fragmenten) {
  const punten = [...fragmenten].sort((a, b) => a.naam.localeCompare(b.naam)).map(f => f.tekst.trim()).filter(Boolean)
    .map(t => (/^[-*] /.test(t) ? t : `- ${t}`));
  if (!punten.length) return changelog;
  const blok = punten.join("\n");
  const i = changelog.indexOf(KOP);
  if (i < 0) {
    // Geen sectie: maak hem aan onder de titel.
    const m = changelog.match(/^# .*\n/);
    const na = m ? m[0].length : 0;
    return `${changelog.slice(0, na)}\n${KOP}\n\n${blok}\n${changelog.slice(na)}`;
  }
  const na = i + KOP.length;
  const rest = changelog.slice(na).replace(/^\n+/, "");
  return `${changelog.slice(0, na)}\n\n${blok}\n${rest ? "\n" + rest : ""}`;
}

export function leesFragmenten(map) {
  return readdirSync(map).filter(n => n.endsWith(".md") && n.toLowerCase() !== "readme.md")
    .map(naam => ({ naam, tekst: readFileSync(join(map, naam), "utf8") }));
}

if (process.argv[1]?.endsWith("changelog.mjs") && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const map = join(root, "changelog.d"), pad = join(root, "CHANGELOG.md");
  const frs = leesFragmenten(map);
  if (!frs.length) { console.log("Geen fragmenten in changelog.d/."); process.exit(0); }
  const nieuw = voegSamen(readFileSync(pad, "utf8"), frs);
  if (process.argv.includes("--dry")) { console.log(nieuw.slice(0, 1500)); process.exit(0); }
  writeFileSync(pad, nieuw);
  for (const f of frs) unlinkSync(join(map, f.naam));
  console.log(`${frs.length} fragment(en) samengevoegd in CHANGELOG.md.`);
}
