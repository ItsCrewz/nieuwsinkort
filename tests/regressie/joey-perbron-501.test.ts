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

test("Bijlmer: één gezamenlijke lijst met alle bronnen", async () => {
  const { item, meer } = fixtures.find((f) => f.item.kop.includes("140 gasten"))!;
  const html = await render(item, meer);
  assert.equal((html.match(/Dit zeggen de bronnen/g) ?? []).length, 2);
  assert.ok(!html.includes("Wat elke bron meldt"));
  const sectie = html.match(/<section class="d-sec" aria-label="Dit zeggen de bronnen">(.*?)<\/section>/)?.[1];
  assert.ok(sectie);
  for (const site of ["RTL Nieuws", "NOS", "Telegraaf", "NU.nl"]) assert.ok(sectie.includes(`>${site}</a>`), site);
  const regels = [...sectie.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
  const easy = regels.filter((r) => r.includes("Het easyHotel aan de Johan Cruijff Boulevard"));
  assert.equal(easy.length, 1);
  assert.ok(easy[0].includes(">RTL Nieuws</a>") && easy[0].includes(">Telegraaf</a>"));
  assert.equal(regels.filter((r) => /140 (hotel)?gasten.*ge[ëe]vacueerd/i.test(r)).length, 1);
  const { bronnenPunten } = await import("../../src/bronnenSamen");
  const punten = bronnenPunten(item, meer);
  assert.equal(new Set(punten.map((p) => p.tekst.toLowerCase().replace(/[^a-z0-9]/g, ""))).size, punten.length);
});

test("datafunctie bewaart feedtekst alleen voor meerdere uitgevers", async () => {
  const { slim, onRequestGet } = await import("../../functions/data.json");
  const item = fixtures.find((f) => f.item.kop.includes("140 gasten"))!.item;
  const enkel = { ...item, bronnen: [item.bronnen[0]] };
  const out = slim({ items: [item, enkel] });
  assert.deepEqual(out.items[0].bronnen, item.bronnen);
  assert.equal(out.items[1].bronnen[0].ft, undefined);
  assert.equal(out.items[1].bronnen[0].fd, undefined);
  const nu = new Date().toISOString();
  const data = { gegenereerd: nu, items: [{ ...item, t: Date.now() }, { ...enkel, kop: "Enkelvoudig testbericht", t: Date.now() }], filmpjes: [], dumpert: [] };
  const respons = await onRequestGet({ request: new Request("https://voorbeeld.nl/data.json"), env: {
    ASSETS: { fetch: async () => new Response(JSON.stringify({ gegenereerd: nu, items: [], filmpjes: [], dumpert: [] })) },
    NIEUWS: { get: async (key: string) => key === "uur" ? data : null },
  } });
  const body = await respons.json();
  assert.deepEqual(body.items[0].bronnen, item.bronnen);
  assert.equal(body.items[1].bronnen[0].ft, undefined);
});

test("oude en enkelvoudige berichten blijven werken", async () => {
  const enkel = fixtures.find((f) => f.item.bronnen.length === 1)!;
  const html = await render(enkel.item, enkel.meer);
  assert.ok(html.includes("<h1"));
  const item = { ...fixtures[0].item, bronnen: fixtures[0].item.bronnen.map(({ site, href }) => ({ site, href })) };
  assert.ok(!(await render(item, null)).includes('aria-label="Dit zeggen de bronnen"'));
});
