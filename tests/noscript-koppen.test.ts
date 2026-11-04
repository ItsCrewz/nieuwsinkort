// Startpagina zonder JavaScript (#313): <noscript> bevat dagsamenvatting en 10 koppen met bronlink uit data.json; escaping, $-patronen, terugval; geen netwerk.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore buildscript is JS
import { metNoscript, noscriptHtml } from "../scripts/noscript-html.mjs";

{
  const items = Array.from({ length: 12 }, (_, n) => ({ kop: `Kop ${n + 1}`, bronnen: [{ site: "NOS", href: `https://nos.nl/a${n + 1}` }] }));
  const html = noscriptHtml({ dag_samenvatting: "Samen <b>vat</b> $& ting", items });
  assert.equal((html.match(/<li>/g) || []).length, 10, "10 koppen");
  assert.ok(html.includes('<a href="https://nos.nl/a1">Kop 1</a> (NOS)') && !html.includes("Kop 11"));
  assert.ok(html.includes("Samen &lt;b&gt;vat&lt;/b&gt; $&amp; ting"), "samenvatting geëscaped");
  assert.ok(html.includes('<a href="/vandaag">'), "link naar /vandaag blijft");
  const gevaarlijk = noscriptHtml({ items: [{ kop: "X", bronnen: [{ href: "javascript:alert(1)" }] }, { kop: "" }] });
  assert.ok(!gevaarlijk.includes("javascript:") && gevaarlijk.includes("<li>X</li>") && (gevaarlijk.match(/<li>/g) || []).length === 1);
  assert.ok(!noscriptHtml(null).includes("<ul>"), "zonder data geen lijst");

  const index = readFileSync("index.html", "utf8");
  const gevuld = metNoscript(index, "<p>$&</p>");
  assert.ok(gevuld.includes("<noscript><p>$&</p></noscript>") && gevuld.includes('<div id="root"></div>'));

}
