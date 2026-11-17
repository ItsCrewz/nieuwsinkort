import assert from "node:assert/strict";
import { berekenBody } from "../../src/dagdata";

const nu = Date.parse("2026-11-17T12:00:00Z");
const origineel = Date.now;
Date.now = () => nu;
try {
  const bron = { site: "NOS", href: "https://nos.nl/artikel/123" };
  const extra = { site: "RTL", href: "https://rtl.nl/artikel/456" };
  const item = { cat: "nl", kop: "Een bericht", ai: "Oude kern", samenvatting: "Oude samenvatting", punten: ["Bestaand punt"], bronnen: [bron], t: nu - 3600000 };
  const routine = { gegenereerd: "2026-11-17T09:00:00Z", items: [item] };
  const uur = { gegenereerd: "2026-11-17T11:00:00Z", items: [{ ...item, ai: "Nieuwe kern", samenvatting: "Nieuwe samenvatting", punten: [], bronnen: [{ ...bron, href: `${bron.href}?utm_source=test` }, extra] }, { ...item, kop: "Ander verhaal", bronnen: [{ site: "NOS", href: "https://nos.nl/artikel/ander" }] }] };
  const lees = async (s: any, h: any) => JSON.parse(await berekenBody(s, h, null, nu));
  const uit = await lees(routine, uur);
  assert.equal(uit.items.length, 2);
  const samen = uit.items.find((i: any) => i.kop === item.kop);
  assert.equal(samen.samenvatting, "Nieuwe samenvatting");
  assert.equal(samen.ai, "Nieuwe kern");
  assert.deepEqual(samen.punten, item.punten);
  assert.deepEqual(samen.bronnen, [bron, extra]);
  const oud = await lees(routine, { ...uur, gegenereerd: "2026-11-17T08:00:00Z" });
  assert.equal(oud.items.find((i: any) => i.kop === item.kop).samenvatting, item.samenvatting);
  const ruw = await lees(routine, { ...uur, items: [{ ...uur.items[0], ruw: true }] });
  assert.equal(ruw.items[0].samenvatting, item.samenvatting);
  const gisteren = await lees(routine, { ...uur, gegenereerd: "2026-11-16T11:00:00Z" });
  assert.deepEqual(gisteren.items[0].bronnen, [bron]);
} finally { Date.now = origineel; }
console.log("✓ #1138 uurdata vult routinebericht aan zonder oudere inhoud terug te zetten");
