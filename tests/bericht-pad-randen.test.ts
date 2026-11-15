// Randgevallen van functions/bericht/[[pad]].ts die bericht-routing/-pagina niet dekken: dubbele id, geen HTML-sjabloon, verwante links, verlopen en ontbrekende data. Vaste klok, mocks, geen netwerk.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artikelPad, linkId } from "../src/artikelid";
import { onRequestGet } from "../functions/bericht/[[pad]]";
const sjabloon = readFileSync("index.html", "utf8");
const echteNu = Date.now;
const zet = (iso: string) => { Date.now = () => Date.parse(iso); };
const maakItem = (n: number, extra: object = {}) => ({ kop: `Bericht nummer ${n}`, ai: `Samenvatting ${n}`, cat: "nl", tijd: "10:00", bronnen: [{ site: "NOS", href: `https://nos.nl/artikel-${n}` }], ...extra });
const html = (t: string) => new Response(t, { headers: { "Content-Type": "text/html; charset=utf-8" } });
const maakEnv = (kv: string | undefined, sjab: () => Response = () => html(sjabloon)) => ({
  ASSETS: { fetch: async (r: Request | string) => String((r as Request).url ?? r).endsWith("/data.json") ? Response.json({ items: [] }) : sjab() },
  NIEUWS: { get: async () => kv },
});
const kvVan = (dag: string, dataset: unknown) => `${dag}\ntag\n${JSON.stringify(dataset)}`;
const bezoek = (env: any, pad: string) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${pad}`), env, waitUntil: (p: Promise<unknown>) => void p } as any);
// geen Cache API: elke aanvraag loopt de volledige route
Object.defineProperty(globalThis, "caches", { configurable: true, value: undefined });

try {
  zet("2026-11-04T12:00:00Z");
  const dag = "2026-11-04";
  const gen = { gegenereerd: `${dag}T09:00:00Z` };

  // meerdere items met dezelfde id: niet eenduidig, dus 302 naar /
  const id = linkId("https://nos.nl/dubbel");
  const a = maakItem(1, { id }), b = maakItem(2, { id });
  let r = await bezoek(maakEnv(kvVan(dag, { ...gen, items: [a, b] })), artikelPad(a, dag));
  assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/"); assert.equal(r.headers.get("cache-control"), "no-store");

  // sjabloon zonder text/html: terugval naar de hash-route (met behoud van de query)
  const enkel = maakItem(3), pad = artikelPad(enkel, dag);
  const dataset = { ...gen, items: [enkel] };
  r = await bezoek(maakEnv(kvVan(dag, dataset), () => new Response("{}", { headers: { "Content-Type": "application/json" } })), `${pad}?x=1`);
  assert.equal(r.status, 302); assert.match(r.headers.get("location")!, /^\/\?x=1#\/bericht\/.+/); assert.equal(r.headers.get("cache-control"), "no-store");
  r = await bezoek(maakEnv(kvVan(dag, dataset), () => new Response("fout", { status: 500, headers: { "Content-Type": "text/html" } })), pad);
  assert.equal(r.status, 302); assert.match(r.headers.get("location")!, /^\/#\/bericht\//);

  // verwante links: max 5, zelfde rubriek, nooit het bericht zelf
  const overig = [4, 5, 6, 7, 8, 9, 10].map((n) => maakItem(n)), anders = maakItem(11, { cat: "sport" });
  r = await bezoek(maakEnv(kvVan(dag, { ...gen, items: [enkel, ...overig, anders] })), pad);
  assert.equal(r.status, 200);
  const tekst = await r.text(), blok = tekst.split("<h2>Meer nieuws</h2>")[1]?.split("</ul>")[0] ?? "";
  assert.equal((blok.match(/<li>/g) || []).length, 5);
  assert.ok(!blok.includes(pad), "het bericht zelf staat er niet tussen");
  assert.ok(!blok.includes("Bericht nummer 11"), "andere rubriek telt niet mee");
  // zonder rubriek geen verwante links
  const zonderCat = maakItem(12, { cat: undefined });
  r = await bezoek(maakEnv(kvVan(dag, { ...gen, items: [zonderCat, ...overig] })), artikelPad(zonderCat, dag));
  assert.equal(r.status, 200); assert.ok(!(await r.text()).includes("Meer nieuws"));

  // dataset verlopen tijdens de aanvraag (klok loopt voorbij 06:00 Amsterdam): 301 naar /
  zet("2026-11-05T04:30:00Z");
  r = await bezoek(maakEnv(kvVan(dag, dataset), () => { zet("2026-11-05T05:30:00Z"); return html(sjabloon); }), `${pad}?q=1`);
  assert.equal(r.status, 301); assert.equal(r.headers.get("location"), "/?q=1"); assert.equal(r.headers.get("cache-control"), "public, max-age=86400");
  zet("2026-11-04T12:00:00Z");

  // ontbrekende of verkeerde gegenereerd, geen items, geen KV: tijdelijk 503
  for (const [naam, kv] of [
    ["geen gegenereerd", kvVan(dag, { items: [enkel] })],
    ["ongeldige datum", kvVan(dag, { gegenereerd: "kapot", items: [enkel] })],
    ["andere dag", kvVan(dag, { gegenereerd: "2026-11-03T09:00:00Z", items: [enkel] })],
    ["items geen lijst", kvVan(dag, { ...gen, items: "x" })],
    ["geen KV-data", undefined],
  ] as const) {
    r = await bezoek(maakEnv(kv), pad);
    assert.equal(r.status, 503, naam); assert.equal(r.headers.get("cache-control"), "no-store", naam);
  }
  console.log("bericht-pad-randen: ok");
} finally { Date.now = echteNu; }
