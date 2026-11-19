import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { Zoekbalk } from "../../src/zoekbalk";

const artikelen = JSON.parse(readFileSync("tests/fixtures/wolf-bram-feeds.json", "utf8")) as { t: string }[];
const term = artikelen[0].t.split(" ")[0];
const ref = createRef<HTMLInputElement>();
const props = { query: term, aantal: artikelen.length, invoer: ref, onChange: () => {} };
const html = renderToStaticMarkup(React.createElement(Zoekbalk, props));
assert.match(html, /<button type="button" class="zoek-terug">Terug naar zoekveld<\/button>/);
assert.match(html, /aria-label="Zoeken"/);
assert.match(html, /aria-controls=/);
assert.doesNotMatch(renderToStaticMarkup(React.createElement(Zoekbalk, { ...props, query: "" })), /Terug naar zoekveld/);

