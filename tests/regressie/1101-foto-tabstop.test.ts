import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { Beelden } from "../../src/beelden";

const bericht = JSON.parse(readFileSync("tests/fixtures/joey/nu-geheugen.json", "utf8"));
const html = renderToStaticMarkup(createElement(Beelden, { urls: bericht.beelden, eager: true }));
assert.match(html, /class="bl-track"[^>]*tabindex="-1"/);
assert.doesNotMatch(html, /aria-label="Foto's"|<button/);
assert.match(html, /alt="" aria-hidden="true"/);
const meer = renderToStaticMarkup(createElement(Beelden, { urls: [...bericht.beelden, ...bericht.beelden.map((u: string) => u + "?b")], eager: true }));
if (/class="bl multi/.test(meer)) {
  assert.match(meer, /class="bl-track"[^>]*tabindex="0"/);
  assert.match(meer, /role="group"/);
  assert.match(meer, /aria-label="Vorige foto"/);
  assert.match(meer, /aria-label="Volgende foto"/);
  assert.match(meer, /aria-live="polite"/);
}
console.log("✓ #1101: één decoratieve foto heeft geen tabstop of carrouselbediening");
