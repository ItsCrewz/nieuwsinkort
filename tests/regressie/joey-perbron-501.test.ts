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
  // De evacuatiezinnen verschillen inhoudelijk en blijven daarom per bron apart.
  assert.ok(evacuatie.every((r) => !(r.includes(">RTL Nieuws</a>") && r.includes(">NOS</a>"))));
  assert.ok(regels.some((r) => r.includes("Het easyHotel aan de Johan Cruijff Boulevard") && r.includes(">RTL Nieuws</a>") && r.includes(">Telegraaf</a>")));
  assert.ok(regels.some((r) => r.includes("ziekenhuis voor verdere controle") && r.includes(">Telegraaf</a>")));
  const { bronnenPunten } = await import("../../src/bronnenSamen");
  const punten = bronnenPunten(item, meer);
  assert.equal(new Set(punten.map((p) => p.tekst.toLowerCase().replace(/[^a-z0-9]/g, ""))).size, punten.length);
});

test("datafunctie bewaart feedtekst alleen voor meerdere uitgevers", async () => {
  const { slim, onRequestGet } = await import("../../functions/data.json.ts");
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
  for (const { item, meer } of fixtures.filter((f) => f.item.bronnen.length > 1)) {
    const punten = bronnenPunten(item, meer);
    for (const bron of item.bronnen.filter((b) => b.ft || b.fd || meer?.perBron?.some((p) => p.site === b.site && p.punten.length))) {
      assert.ok(punten.some((p) => p.bronnen.some((b) => b.site === bron.site)), `${item.kop}: ${bron.site}`);
    }
    const genormaliseerd = punten.map((p) => p.tekst.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""));
    assert.equal(new Set(genormaliseerd).size, punten.length, item.kop);
    for (const punt of punten) for (const label of punt.bronnen) {
      const bron = item.bronnen.find((b) => b.site === label.site)!;
      const teksten = [bron.ft ?? "", ...(bron.fd?.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? []), ...(meer?.perBron?.find((b) => b.site === bron.site)?.punten ?? [])];
      const { zelfdeZin } = await import("../../src/bronnenSamen");
      assert.ok(teksten.some((tekst) => zelfdeZin(punt.tekst, tekst, item.bronnen.map((b) => b.site))), `${label.site}: ${punt.tekst}`);
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

test("getallen blijven gekoppeld aan hun inhoudswoord en volgorde", async () => {
  const { bronnenPunten } = await import("../../src/bronnenSamen");
  const basis = fixtures.find((f) => f.item.bronnen.length > 1)!.item;
  for (const [a, b] of [
    ["Bij het ongeluk zijn 2 mensen overleden en 3 mensen gewond geraakt", "Bij het ongeluk zijn 3 mensen overleden en 2 mensen gewond geraakt"],
    ["Bij het ongeluk vielen 3 doden en meerdere slachtoffers", "Bij het ongeluk vielen 3 gewonden en meerdere slachtoffers"],
  ]) {
    const item = { ...basis, kop: "Ander bericht", ai: "", samenvatting: "", bronnen: [
      { site: "A", href: "https://a.example", ft: a }, { site: "B", href: "https://b.example", ft: b },
    ] };
    assert.deepEqual(bronnenPunten(item, null).map((p) => [p.tekst, p.bronnen.map((bron) => bron.site)]), [[a, ["A"]], [b, ["B"]]]);
  }
});


test("alleen bijna identieke zinnen worden samengevoegd", async () => {
  const { bronnenPunten } = await import("../../src/bronnenSamen");
  const basis = fixtures.find((f) => f.item.bronnen.length > 1)!.item;
  for (const [a, b] of [
    ["2 mensen overleden en 3 mensen gewond", "2 mensen gewond en 3 mensen overleden"],
    ["Rusland beschuldigt Oekraïne van een aanval op een energiecentrale", "Oekraïne beschuldigt Rusland van een aanval op een energiecentrale"],
    ["Het kabinet vergaderde gisteren over de opvang van asielzoekers", "Het kabinet vergaderde vandaag over de opvang van asielzoekers"],
    ["In Amsterdam is vandaag een groot gebouw geopend", "In Rotterdam is vandaag een groot gebouw geopend"],
    ["De verdachte is niet aangehouden maar wel verhoord", "De verdachte is aangehouden maar niet verhoord"],
  ]) {
    const item = { ...basis, kop: "Ander bericht", ai: "", samenvatting: "", bronnen: [
      { site: "A", href: "https://a.example", ft: a }, { site: "B", href: "https://b.example", ft: b },
    ] };
    assert.deepEqual(bronnenPunten(item, null).map((p) => [p.tekst, p.bronnen.map((bron) => bron.site)]), [[a, ["A"]], [b, ["B"]]]);
  }
  const a = "Het kabinet trekt extra geld uit voor de opvang van asielzoekers.";
  const vraag = "Trekt het kabinet extra geld uit voor de opvang van asielzoekers?";
  const fd = "Tijdens het begrotingsdebat spreken de partijen over de plannen.";
  const item = { ...basis, kop: "Ander bericht", ai: "", samenvatting: "", bronnen: [
    { site: "A", href: "https://a.example", ft: a }, { site: "B", href: "https://b.example", ft: vraag, fd },
  ] };
  assert.deepEqual(bronnenPunten(item, null).map((p) => [p.tekst, p.bronnen.map((bron) => bron.site)]), [[a, ["A"]], [fd, ["B"]]]);
  const zin = "Het kabinet trekt extra geld uit voor de opvang";
  const gelijk = { ...item, bronnen: [{ site: "A", href: "https://a.example", ft: zin }, { site: "B", href: "https://b.example", ft: '“HET KABINET TREKT EXTRA GELD UIT VOOR DE OPVANG” - NOS' }] };
  assert.deepEqual(bronnenPunten(gelijk, null).map((p) => [p.tekst, p.bronnen.map((bron) => bron.site)]), [[zin, ["A", "B"]]]);
});


test("Bijlmer: identieke easyHotel-zin heeft precies twee bronlabels", async () => {
  const { bronnenPunten } = await import("../../src/bronnenSamen");
  const { item, meer } = fixtures.find((f) => f.item.kop.includes("140 gasten"))!;
  const zin = "Het easyHotel aan de Johan Cruijff Boulevard in Amsterdam-Zuidoost is in de nacht van maandag op dinsdag ontruimd vanwege een grote brand.";
  assert.deepEqual(bronnenPunten(item, meer).filter((p) => p.tekst === zin).map((p) => [p.tekst, p.bronnen.map((b) => b.site)]), [[zin, ["RTL Nieuws", "Telegraaf"]]]);
});

test("alleen bekende bronnamen en ANP worden als suffix verwijderd", async () => {
  const { bronnenPunten } = await import("../../src/bronnenSamen");
  const basis = fixtures.find((f) => f.item.bronnen.length > 1)!.item;
  const punten = (a: string, b: string) => bronnenPunten({ ...basis, kop: "Ander bericht", ai: "", samenvatting: "", bronnen: [
    { site: "A", href: "https://a.example", ft: a }, { site: "B", href: "https://b.example", ft: b },
  ] }, null).map((p) => [p.tekst, p.bronnen.map((bron) => bron.site)]);
  const a = "Brand in woning Utrecht - drie gewonden";
  const b = "Brand in woning Utrecht - geen gewonden";
  assert.deepEqual(punten(a, b), [[a, ["A"]], [b, ["B"]]]);
  const zin = "Brand in woning Utrecht";
  for (const suffix of [" - NOS", " (ANP)"]) assert.deepEqual(punten(zin + suffix, zin), [[zin, ["A", "B"]]]);
  assert.deepEqual(punten(zin + " (drie gewonden)", zin + " (geen gewonden)"), [[zin + " (drie gewonden)", ["A"]], [zin + " (geen gewonden)", ["B"]]]);
});

// Review ronde 7: twee bronnen met elk een eigen titel en optioneel een feedomschrijving.
async function tweeBronnen(a: { ft: string; fd?: string }, b: { ft: string; fd?: string }) {
  const { bronnenPunten } = await import("../../src/bronnenSamen");
  const basis = fixtures.find((f) => f.item.bronnen.length > 1)!.item;
  return bronnenPunten({ ...basis, kop: "Ander bericht", ai: "", samenvatting: "", bronnen: [
    { site: "A", href: "https://a.example", ...a }, { site: "B", href: "https://b.example", ...b },
  ] }, null).map((p) => [p.tekst, p.bronnen.map((bron) => bron.site)]);
}

test("getaltekens, valuta en procent blijven onderscheidend", async () => {
  for (const [a, b] of [
    ["De economische groei bedraagt -0,5 procent dit kwartaal", "De economische groei bedraagt 0,5 procent dit kwartaal"],
    ["De economische groei bedraagt +2 procent dit kwartaal", "De economische groei bedraagt 2 procent dit kwartaal"],
    ["Het abonnement kost voortaan €10 per maand voor iedereen", "Het abonnement kost voortaan $10 per maand voor iedereen"],
    ["Het abonnement kost voortaan £10 per maand voor iedereen", "Het abonnement kost voortaan 10 per maand voor iedereen"],
    ["De werkloosheid steeg naar 4% in de afgelopen maand", "De werkloosheid steeg naar 4 in de afgelopen maand"],
  ]) assert.deepEqual(await tweeBronnen({ ft: a }, { ft: b }), [[a, ["A"]], [b, ["B"]]]);
});

test("zinsplitser knipt niet binnen getallen of afkortingen", async () => {
  const a = "De schade bedraagt 1.500 euro voor iedere gedupeerde bewoner.";
  const b = "De schade bedraagt 2.500 euro voor iedere gedupeerde bewoner.";
  const punten = await tweeBronnen({ ft: "Brand in flat Utrecht", fd: a }, { ft: "Brand in flat Zeist", fd: b });
  assert.deepEqual(punten, [[a, ["A"]], [b, ["B"]]]);
  const c = "Volgens dhr. Jansen is de schade bij de brand in de flat groot.";
  const d = "De brandweer was met 2,5 man per wagen ter plaatse in Utrecht.";
  assert.deepEqual(await tweeBronnen({ ft: "Brand in flat Utrecht", fd: `${c} ${d}` }, { ft: "Brand in flat Zeist", fd: b }), [[c, ["A"]], [d, ["A"]], [b, ["B"]]]);
});

test("een vraagtitel met bronsuffix of aanhalingsteken is geen bewijs voor een stelling", async () => {
  const zin = "Het kabinet trekt extra geld uit voor de opvang";
  const fd = "Tijdens het begrotingsdebat spreken de partijen over de plannen.";
  for (const vraag of [zin + "? - NOS", `“${zin}?”`, `'${zin}?' (ANP)`]) {
    assert.deepEqual(await tweeBronnen({ ft: zin }, { ft: vraag, fd }), [[zin, ["A"]], [fd, ["B"]]], vraag);
  }
});

test("een bron met alleen een korte titel blijft zichtbaar", async () => {
  const lang = "Minister van Financiën treedt af na kritiek op begroting.";
  assert.deepEqual(await tweeBronnen({ ft: "Minister stapt op" }, { ft: "Minister weg", fd: lang }), [["Minister stapt op", ["A"]], [lang, ["B"]]]);
  assert.deepEqual(await tweeBronnen({ ft: "Minister stapt op - NOS" }, { ft: "Minister stapt op" }), [["Minister stapt op", ["A", "B"]]]);
});
