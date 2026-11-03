import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { DetailView } from "../../src/detail";
import { prefetchMeer } from "../../src/meer";
import type { Item, Meer } from "../../src/types";

const fixtures = JSON.parse(readFileSync("tests/fixtures/joey/perbron-501.json", "utf8")) as { item: Item; meer: Meer | null }[];

// Server-render met de gemockte /meer-respons als geladen hookstatus.
async function render(item: Item, meer: Meer | null) {
  globalThis.fetch = async () => new Response(JSON.stringify(meer), { status: 200 });
  const geladen = await prefetchMeer(item);
  const intern = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  let herstel = () => {};
  function MetMeer() {
    const dispatcher = intern.ReactCurrentDispatcher.current;
    const origineel = dispatcher.useState;
    dispatcher.useState = (init: unknown) => {
      if (init && typeof init === "object" && "meer" in init && "laden" in init) return [{ meer: geladen, laden: false }, () => {}];
      return origineel(init);
    };
    herstel = () => { dispatcher.useState = origineel; };
    return createElement(DetailView, { item, onBack: () => {}, bionic: false });
  }
  try { return renderToStaticMarkup(createElement(MetMeer)); } finally { herstel(); }
}

for (const { item, meer } of fixtures) {
  test(`bronnen met punten of uitleg: ${item.kop}`, async () => {
    // De livefixture bevat voor Abu Dhabi geen blob; boots de gemelde lege perBron na.
    const respons = meer ?? (item.kop.includes("Abu Dhabi") ? { uitleg: ["De gesprekken vinden plaats in Abu Dhabi."], perBron: [] } : null);
    const html = await render(item, respons);
    const sectie = html.match(/<section class="d-sec" aria-label="Wat elke bron meldt">(.*?)<\/section>/)?.[1];
    if (item.bronnen.length === 1) { assert.equal(sectie, undefined); return; }
    assert.ok(sectie, "sectie is zichtbaar");
    const blokken = [...sectie.matchAll(/<div class="pb">(.*?)<\/div>/g)].map((m) => m[1]);
    for (const bron of item.bronnen) {
      const blok = blokken.find((b) => b.includes(`>${bron.site}<`));
      assert.ok(blok, `${bron.site} ontbreekt`);
      assert.ok(/<li>|<p>[^<]+<\/p>/.test(blok), `${bron.site} mist punten of reden`);
      assert.ok(blok.includes(bron.href));
    }
    for (const bron of meer?.perBron ?? []) for (const punt of bron.punten) assert.ok(sectie.includes(punt));
  });
}
