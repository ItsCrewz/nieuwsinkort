import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/index.css", "utf8");
const licht = css.match(/:root\s*\{([^}]*)\}/)?.[1];
const donker = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1];
assert.ok(licht && donker);

function kleur(blok: string, naam: string): string {
  const waarde = blok.match(new RegExp(`--${naam}:\\s*(#[0-9a-f]{6})\\b`, "i"))?.[1];
  assert.ok(waarde, `Kleur --${naam} ontbreekt`);
  return waarde;
}

function luminantie(hex: string): number {
  const kanalen = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * kanalen[0] + 0.7152 * kanalen[1] + 0.0722 * kanalen[2];
}

function contrast(a: string, b: string): number {
  const waarden = [luminantie(a), luminantie(b)].sort((x, y) => y - x);
  return (waarden[0] + 0.05) / (waarden[1] + 0.05);
}

assert.match(css, /\.tab,\.tab-m\{[^}]*color:var\(--muted\)/);
assert.match(css, /\.tab\[aria-selected="true"\]\{color:var\(--ink\)/);
assert.match(css, /\.fpill-n\{color:var\(--muted\)/);
for (const [thema, blok] of [["licht", licht], ["donker", donker]] as const) {
  for (const [tekst, achtergrond] of [["muted", "seg"], ["muted", "card"], ["ink", "seg"], ["ink", "seg-on"], ["ink", "card"]]) {
    const verhouding = contrast(kleur(blok, tekst), kleur(blok, achtergrond));
    assert.ok(verhouding >= 4.5, `${thema}: --${tekst} op --${achtergrond}: ${verhouding}`);
  }
  assert.ok(contrast(kleur(blok, "ink"), kleur(blok, "seg")) > contrast(kleur(blok, "muted"), kleur(blok, "seg")));
}
console.log("✓ Contrast van rubriektabs en filteraantallen in beide thema’s");
