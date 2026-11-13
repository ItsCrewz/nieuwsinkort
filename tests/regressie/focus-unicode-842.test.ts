import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { BionicText } from "../../src/ui";

for (const [tekst, verwacht] of [
  ["𐐀bc", "<b>𐐀</b>bc"],
  ["e\u0301ten", "<b>e\u0301t</b>en"],
  ["Het Nederlandse nieuws", "<b>H</b>et <b>Neder</b>landse <b>nie</b>uws"],
]) {
  const render = (on: boolean) => renderToStaticMarkup(createElement(BionicText, { text: tekst, on }));
  assert.equal(render(true), verwacht);
  assert.equal(render(true).replace(/<\/?b>/g, ""), tekst);
  assert.equal(render(false), tekst);
}
