// Routering, verloop en Cache API van /bericht/…: vaste klok, KV- en cachemocks, geen netwerk.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artikelId, artikelPad, linkId } from "../src/artikelid";
import { berichtHtml } from "../src/berichthtml";
import { onRequestGet } from "../functions/bericht/[[pad]]";
const sjabloon = readFileSync("index.html", "utf8");
const csp = /Content-Security-Policy: (.+)/.exec(readFileSync("public/_headers", "utf8"))![1]; // echte CSP: de pagina draait onder dezelfde hash als de app

const echteNu = Date.now;
const zet = (iso: string) => { Date.now = () => Date.parse(iso); };
const item = { kop: "Verdachten aangehouden", ai: "Eigen samenvatting", samenvatting: "Meer uitleg", punten: ["Punt"], cat: "nl", tijd: "10:00", bronnen: [{ site: "NOS", href: "https://nos.nl/a?x=1" }, { site: "NU.nl", href: "https://www.nu.nl/b" }] };
const maakEnv = (dag: string, items: unknown[], tel: { reads: number }) => ({
  ASSETS: { fetch: async (r: Request | string) => String((r as Request).url ?? r).endsWith("/data.json") ? Response.json({}) : new Response(sjabloon, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp } }) },
  NIEUWS: { get: async () => { tel.reads++; return `${dag}\ntag\n${JSON.stringify({ gegenereerd: `${dag}T09:00:00Z`, items })}`; } },
});
const bezoek = (env: any, pad: string, extra: any = {}, headers: Record<string, string> = {}) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${pad}`, { headers }), env, waitUntil: extra.waitUntil || ((p: Promise<unknown>) => void p) } as any);

// Cache API-mock (Node heeft geen caches.default)
const opslag = new Map<string, Response>(); let puts = 0;
Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: { match: async (r: Request) => { return opslag.get(r.url)?.clone(); }, put: async (r: Request, res: Response) => { puts++; opslag.set(r.url, res); } } } });
const pending: Promise<unknown>[] = [];
const wu = { waitUntil: (p: Promise<unknown>) => { pending.push(p); } };

try {
  zet("2026-11-04T12:00:00Z");
  const dag = "2026-11-04", pad = artikelPad(item, dag);
  const tel = { reads: 0 }, env = maakEnv(dag, [item], tel);

  // Cache API: eerste aanvraag leest KV en schrijft de cache, de tweede niet; query telt niet mee
  let r = await bezoek(env, pad, wu); await Promise.all(pending);
  assert.equal(r.status, 200); assert.equal(tel.reads, 1); assert.equal(puts, 1);
  assert.equal(r.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=600");
  const tag = r.headers.get("etag")!; assert.ok(tag);
  r = await bezoek(env, `${pad}?fbclid=abc&utm_source=x`, wu);
  assert.equal(r.status, 200); assert.equal(tel.reads, 1, "tweede aanvraag uit cache: geen KV-read"); assert.equal(puts, 1);
  assert.ok((await r.text()).includes(`<link rel="canonical" href="https://nieuwsinkort.nl${pad}" />`), "canonical zonder query");
  r = await bezoek(env, pad, wu, { "If-None-Match": tag }); assert.equal(r.status, 304); assert.equal(tel.reads, 1);
  // meerdere tags, zwakke vergelijking en wildcard (cachetreffer); niet-passend geeft 200 met inhoud en cacheheaders
  for (const kop of [`"x", ${tag}`, `W/${tag}`, `"x" , W/${tag}, "y"`, "*"]) { r = await bezoek(env, pad, wu, { "If-None-Match": kop }); assert.equal(r.status, 304, kop); assert.equal(r.headers.get("etag"), tag); }
  r = await bezoek(env, pad, wu, { "If-None-Match": '"a", W/"b"' }); assert.equal(r.status, 200); assert.ok((await r.text()).length > 100); assert.equal(r.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=600");
  // vers gegenereerd pad (lege cache)
  for (const [kop, status] of [[`"x", ${tag}`, 304], [`W/${tag}`, 304], ["*", 304], ['"a", "b"', 200]] as const) {
    opslag.clear(); r = await bezoek(env, pad, wu, { "If-None-Match": kop }); await Promise.all(pending);
    assert.equal(r.status, status, `vers ${kop}`); assert.equal(r.headers.get("etag"), tag); assert.equal(r.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=600");
    if (status === 200) assert.ok((await r.text()).length > 100);
  }
  opslag.clear(); await bezoek(env, pad, wu); await Promise.all(pending);
  // redirects en fouten komen nooit in de cache
  const putsVoor = puts;
  await bezoek(env, `/bericht/${dag}/aaaaaaaa-onbekend`, wu); await bezoek(env, "/bericht/2026-11-02/aaaaaaaa-oud", wu); await bezoek(env, `${pad}-fout`, wu);
  assert.equal(puts, putsVoor);
  // kapotte cache breekt de pagina niet
  const echt = (globalThis.caches as any).default;
  (globalThis.caches as any).default = { match: async () => { throw new Error("cache stuk"); }, put: async () => { throw new Error("cache stuk"); } };
  opslag.clear(); r = await bezoek(env, pad, wu); await Promise.allSettled(pending); assert.equal(r.status, 200);
  (globalThis.caches as any).default = echt; opslag.clear();

  // aliassen: verkeerde slug en oude id (ander bronnen-anker) => 301 naar canoniek, nooit gecachet
  const metId = { ...item, id: linkId("https://ander.nl/som-anker") }, canoniek = artikelPad(metId, dag);
  const env2 = maakEnv(dag, [metId], { reads: 0 });
  for (const p of [canoniek.replace(/-[^-]+$/, "-andere-slug"), `/bericht/${dag}/${linkId(item.bronnen[0].href)}-oude-id`, `/bericht/${dag}/${linkId(item.bronnen[1].href)}-oude-id`]) {
    r = await bezoek(env2, p, wu); assert.equal(r.status, 301, p); assert.equal(r.headers.get("location"), canoniek); assert.equal(r.headers.get("cache-control"), "no-store");
  }
  r = await bezoek(env2, canoniek, wu); assert.equal(r.status, 200);
  // vandaag maar onbekend
  r = await bezoek(env2, `/bericht/${dag}/zzzzzzzz-niet`, wu);
  assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/"); assert.equal(r.headers.get("cache-control"), "no-store"); assert.equal(r.headers.get("x-robots-tag"), "noindex");
  // dataset van een andere dag is tijdelijk onvolledig
  const envOud = maakEnv("2026-11-03", [item], { reads: 0 }); zet("2026-11-04T12:00:00Z");
  r = await bezoek(envOud, pad, wu); assert.equal(r.status, 503); assert.equal(r.headers.get("cache-control"), "no-store");
  // ongeldig: 404
  for (const p of ["/bericht/2026-02-30/aaaaaaaa-x", "/bericht/2026-11-05/aaaaaaaa-x", "/bericht/2026-11-04/kort-x", "/bericht/2026-11-04"]) assert.equal((await bezoek(env2, p, wu)).status, 404, p);

  // grens 06:00 (winter, UTC+1): gisteren leeft tot 05:59 Amsterdam
  const grens = async (nuIso: string, dagPad: string, verwacht: number) => {
    zet(nuIso); const t = { reads: 0 };
    const res = await bezoek(maakEnv(dagPad, [{ ...item }], t), artikelPad(item, dagPad), wu);
    assert.equal(res.status, verwacht, `${nuIso} voor ${dagPad}`);
    if (verwacht === 301) { assert.equal(t.reads, 0); assert.equal(res.headers.get("location"), "/"); assert.equal(res.headers.get("cache-control"), "public, max-age=86400"); }
    return res;
  };
  await grens("2026-11-05T04:59:00Z", "2026-11-04", 200); // 05:59
  await grens("2026-11-05T05:00:00Z", "2026-11-04", 301); // 06:00
  await grens("2026-11-05T05:00:00Z", "2026-11-05", 200);
  await grens("2026-11-06T00:00:00Z", "2026-11-04", 301); // eergisteren
  // zomertijd (UTC+2)
  await grens("2026-07-06T03:59:00Z", "2026-07-05", 200); // 05:59
  await grens("2026-07-06T04:00:00Z", "2026-07-05", 301); // 06:00
  // DST-einde 2026-10-25 (03:00 → 02:00): 05:59 en 06:00 lokaal zijn UTC+1
  await grens("2026-10-25T04:59:00Z", "2026-10-24", 200);
  await grens("2026-10-25T05:00:00Z", "2026-10-24", 301);
  await grens("2026-10-25T05:00:00Z", "2026-10-25", 200);
  // DST-begin 2026-03-29 (02:00 → 03:00): 05:59 lokaal = 03:59Z (UTC+2)
  await grens("2026-03-29T03:59:00Z", "2026-03-28", 200);
  await grens("2026-03-29T04:00:00Z", "2026-03-28", 301);
  // rond middernacht: 23:30 lokaal is nog dezelfde dag, 00:30 de volgende
  await grens("2026-11-04T22:30:00Z", "2026-11-04", 200); // 23:30
  await grens("2026-11-04T23:30:00Z", "2026-11-04", 200); // 00:30 op 05-11, gisteren < 06:00
  zet("2026-11-04T12:00:00Z");

  // ruw en politiek: noindex en geen letterlijke feedtekst in beschrijving of body
  for (const extra of [{ ruw: true }, { cat: "politiek" }]) {
    const x = { ...item, ...extra, ai: "Letterlijke feedtekst", samenvatting: "Meer letterlijke feedtekst", punten: ["Letterlijk punt"] };
    const h = berichtHtml(sjabloon, x, dag);
    assert.ok(/<meta name="robots" content="noindex"/.test(h)); assert.ok(!h.includes("Letterlijke feedtekst")); assert.ok(!h.includes("Letterlijk punt"));
  }
  assert.ok(berichtHtml(sjabloon, item, dag).includes("max-image-preview:large"));
  // eigen logo als og:image, nooit de bronfoto; ongeldige t geeft geen crash
  const h = berichtHtml(sjabloon, { ...item, t: "geen-datum", beelden: ["https://bron.nl/foto.jpg"] } as any, dag);
  assert.ok(h.includes('property="og:image" content="https://nieuwsinkort.nl/og-image.png"')); assert.ok(!h.includes("foto.jpg"));
  assert.ok(h.includes(`${dag}T00:00:00+01:00`));
  // headers
  r = await bezoek(maakEnv(dag, [item], { reads: 0 }), pad, wu);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff"); assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("strict-transport-security"), "max-age=86400"); assert.equal(r.headers.get("content-security-policy"), csp);

  // id-botsingen in echte dagdata (routine zonder id) en met worker-ids
  const echt2 = JSON.parse(readFileSync("public/data.json", "utf8")).items as any[];
  const ids = echt2.map((i) => artikelId(i)), uniek = new Set(ids);
  assert.equal(uniek.size, ids.length, `botsing: ${ids.filter((x, i) => ids.indexOf(x) !== i).join(",")}`);
  for (const i of echt2) assert.match(artikelId(i), /^[0-9a-z]{8}$/);
  // ruw → som: de som houdt de id van het anker, dus dezelfde pagina (geen botsing met andere items)
  const anker = "https://nos.nl/anker";
  const ruw = { id: linkId(anker), kop: "Ruwe kop" }, som = { id: linkId(anker), kop: "Nette AI-kop" };
  assert.equal(artikelId(ruw), artikelId(som));
} finally { Date.now = echteNu; }
