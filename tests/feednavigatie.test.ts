import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { FeedNavigatie } from "../src/feednavigatie";

const knop = createElement("button", null, "Volgend bericht");
const verborgen = renderToStaticMarkup(createElement(FeedNavigatie, { verborgen: true, children: knop }));
const zichtbaar = renderToStaticMarkup(createElement(FeedNavigatie, { verborgen: false, children: knop }));
assert.match(verborgen, /aria-hidden="true"/);
assert.match(verborgen, /\sinert=""/);
assert.match(zichtbaar, /aria-hidden="false"/);
assert.doesNotMatch(zichtbaar, /\sinert(?:=|\s|>)/);
console.log("Feednavigatie: verborgen en zichtbare toestand geslaagd");
