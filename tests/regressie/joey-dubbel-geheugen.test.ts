// Regressie (Joey 02-11, #488): ook dit item zonder /meer mag geen dubbele uitleg tonen.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { DetailView } from "../../src/detail";
import type { Item } from "../../src/types";

const item = JSON.parse(readFileSync("tests/fixtures/joey/nu-geheugen.json", "utf8")) as Item;
const html = renderToStaticMarkup(createElement(DetailView, { item, onBack: () => {}, bionic: false, dag: "2026-11-03" }));
assert.ok(!html.includes('aria-label="Uitgebreid"'));
assert.ok(html.includes("Sam Altman van OpenAI") && html.includes("beter in datacenters"));
assert.ok(html.includes('aria-label="Bronnen"'));
console.log("ok - geheugenitem zonder /meer herhaalt geen intro en samenvatting");
