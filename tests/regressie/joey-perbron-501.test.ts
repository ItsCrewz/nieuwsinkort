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
  const evacuatie = regels.filter((r) => r.includes("140 gasten geëvacueerd"));
  assert.equal(evacuatie.length, 1);
  assert.ok(evacuatie[0].includes(">RTL Nieuws</a>") && evacuatie[0].includes(">NOS</a>"));
  assert.ok(regels.some((r) => r.includes("ziekenhuis voor verdere controle") && r.includes(">Telegraaf</a>")));
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


test("bronlabels worden gedekt door eigen tekst en unieke informatie blijft zichtbaar", async () => {
  const { bronnenPunten } = await import("../../src/bronnenSamen");
  const stop = new Set("de het een en in van op aan voor bij met is zijn was waren om door na als dat die deze dit te uit naar over tot zich heeft hebben werd worden er ook nog al hun haar vanwege".split(" "));
  const woorden = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !stop.has(w)) ?? []);
  for (const { item, meer } of fixtures.filter((f) => f.item.bronnen.length > 1)) {
    const punten = bronnenPunten(item, meer);
    for (const bron of item.bronnen.filter((b) => b.ft || b.fd || meer?.perBron?.some((p) => p.site === b.site && p.punten.length))) {
      assert.ok(punten.some((p) => p.bronnen.some((b) => b.site === bron.site)), `${item.kop}: ${bron.site}`);
    }
    const genormaliseerd = punten.map((p) => p.tekst.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""));
    assert.equal(new Set(genormaliseerd).size, punten.length, item.kop);
    for (const punt of punten) for (const label of punt.bronnen) {
      const bron = item.bronnen.find((b) => b.site === label.site)!;
      const teksten = [bron.ft?.replace(/^[^|]{1,40}\|\s*/, "") ?? "", ...(bron.fd?.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? []), ...(meer?.perBron?.find((b) => b.site === bron.site)?.punten ?? [])];
      const inhoud = woorden(punt.tekst);
      assert.ok(teksten.some((tekst) => { const eigen = woorden(tekst); return [...inhoud].filter((w) => [...eigen].some((v) => v === w || (v.length >= 5 && w.length >= 5 && (v.slice(0, 5) === w.slice(0, 5) || v.endsWith(w) || w.endsWith(v))))).length / inhoud.size >= 0.85; }), `${label.site}: ${punt.tekst}`);
      const getallen = (s: string) => (s.match(/\d+(?:[.,:-]\d+)*|(?<![\p{L}])(?:één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien)(?![\p{L}])/giu) ?? []).map((x) => x.toLowerCase());
      const namen = (s: string) => (s.match(/\b[\p{L}][\p{L}\p{M}]*\b/gu) ?? []).filter((w, i) => (i > 0 && /^\p{Lu}/u.test(w)) || /^\p{Lu}{2,}$/u.test(w));
      assert.ok(teksten.some((tekst) => getallen(punt.tekst).every((g) => getallen(tekst).includes(g)) && namen(punt.tekst).every((n) => tekst.toLowerCase().split(/[^\p{L}\p{M}]+/u).includes(n.toLowerCase()))), `${label.site}: ${punt.tekst}`);
    }
  }
  const qeshm = fixtures.find((f) => f.item.kop.includes("eiland Qeshm"))!;
  assert.ok(bronnenPunten(qeshm.item, qeshm.meer).every((p) => !/explosies/i.test(p.tekst) || !p.bronnen.some((b) => b.site === "Telegraaf")));
  const crash = fixtures.find((f) => f.item.kop.startsWith("Privévliegtuig viel"))!;
  const learjet = bronnenPunten(crash.item, crash.meer).filter((p) => p.tekst.includes("Learjet 60"));
  for (const punt of learjet) assert.deepEqual(punt.bronnen.map((b) => b.site), ["Telegraaf"]);
  const binance = fixtures.find((f) => f.item.kop.startsWith("Noord-Korea ontkent"))!;
  assert.ok(bronnenPunten(binance.item, binance.meer).every((p) => !/\bFBI\b/.test(p.tekst) || !p.bronnen.some((b) => b.site === "RTL Nieuws")));
  assert.ok(bronnenPunten(binance.item, binance.meer).some((p) => p.bronnen.some((b) => b.site === "NU.nl")));
});

test("verschillende getallen en ontkenningen blijven afzonderlijke punten", async () => {
  const { bronnenPunten } = await import("../../src/bronnenSamen");
  const basis = fixtures.find((f) => f.item.bronnen.length > 1)!.item;
  const item = { ...basis, kop: "Een andere kop voor dit bericht", ai: "", samenvatting: "", bronnen: [
    { site: "A", href: "https://a.example", ft: "De rechtbank veroordeelt vandaag tien mensen tot 12 maanden cel", fd: "Dit is niet zo." },
    { site: "B", href: "https://b.example", ft: "De rechtbank veroordeelt vandaag tien mensen tot 21 maanden cel" },
    { site: "C", href: "https://c.example", ft: "De rechtbank veroordeelt vandaag niet tien mensen tot 12 maanden cel" },
  ] };
  assert.deepEqual(bronnenPunten(item, null).map((p) => ({ tekst: p.tekst, bronnen: p.bronnen.map((b) => b.site) })), [
    { tekst: item.bronnen[0].ft, bronnen: ["A"] },
    { tekst: item.bronnen[1].ft, bronnen: ["B"] },
    { tekst: item.bronnen[2].ft, bronnen: ["C"] },
  ]);
});
