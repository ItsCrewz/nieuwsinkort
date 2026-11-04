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

  // Overeenkomst met het statische data.json (= /data.json?statisch=1): zelfde samenvatting, zelfde eerste 10 koppen in dezelfde volgorde.
  const stat = JSON.parse(readFileSync("public/data.json", "utf8"));
  const uitNoscript = noscriptHtml(stat);
  const verwacht = stat.items.filter((i: any) => typeof i?.kop === "string" && i.kop.trim()).slice(0, 10).map((i: any) => i.kop);
  const gevonden = [...uitNoscript.matchAll(/<li>(?:<a href="[^"]*">)?(.*?)(?:<\/a>)?(?: \([^)]*\))?<\/li>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
  assert.deepEqual(gevonden, verwacht, "koppen = eerste 10 van het statische data.json");
  if (stat.dag_samenvatting) assert.ok(uitNoscript.includes("<h2>In het kort</h2>"), "dagsamenvatting aanwezig");
}
