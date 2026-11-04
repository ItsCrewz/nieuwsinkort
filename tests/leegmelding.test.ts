import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { LeegMelding } from "../src/leegmelding";

const meld = (aantal: number) => renderToStaticMarkup(createElement(LeegMelding, { aantal, onAanpassen: () => {}, onReset: () => {} }));
const leeg = meld(0);
assert.match(leeg, /Nog geen berichten in deze rubriek/);
assert.doesNotMatch(leeg, /<button|Geen berichten met deze filters/);
const gefilterd = meld(1);
assert.match(gefilterd, /Geen berichten met deze filters/);
assert.match(gefilterd, /<button[^>]*>Filters aanpassen<\/button>/);
assert.match(gefilterd, /<button[^>]*>Standaard<\/button>/);
assert.doesNotMatch(gefilterd, /Nog geen berichten in deze rubriek/);
console.log("Leegmelding: lege rubriek en filters geslaagd");
