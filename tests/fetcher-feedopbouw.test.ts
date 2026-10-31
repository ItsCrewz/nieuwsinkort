import assert from "node:assert/strict";
import { Fetcher } from "../worker/src/index";

const nu = Date.parse("2026-10-30T12:00:00Z");
const oudeNow = Date.now;
const oudeFetch = globalThis.fetch;
Date.now = () => nu;
const opslag = new Map<string, any>();
const kv = new Map<string, string>();
const verzoeken: string[] = [];
const fetcher = new Fetcher({ storage: { get: async (k: string) => opslag.get(k), put: async (k: string, v: unknown) => { opslag.set(k, v); } } } as any, { NIEUWS: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { kv.set(k, v); } } } as any);
globalThis.fetch = async (input) => {
  const url = String(input);
  verzoeken.push(url);
  if (url.endsWith("/rss")) return new Response('<rss><item><title>Vandaag</title><link>https://nieuws.nl/a</link><pubDate>Fri, 30 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Oud</title><link>https://nieuws.nl/b</link><pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate></item></rss>');
  if (url.endsWith("/json")) return Response.json({ waarde: 42 });
  if (url.endsWith("/html")) return new Response("<html>geen feed</html>");
  if (url.endsWith("/ontbreekt")) return new Response("niet gevonden", { status: 404 });
  if (url.endsWith("/artikel")) return new Response('<html><head><meta property="og:image" content="https://nieuws.nl/foto.jpg"></head></html>', { headers: { "content-type": "text/html" } });
  throw new Error(`Onverwacht netwerkverzoek: ${url}`);
};
try {
  const jobs = [
    { url: "https://nieuws.nl/rss", kind: "feed" },
    { url: "https://nieuws.nl/json", kind: "json" },
    { url: "https://nieuws.nl/html", kind: "feed" },
    { url: "https://nieuws.nl/ontbreekt", kind: "feed" },
    { url: "https://nieuws.nl/artikel", kind: "og" },
    { url: "http://127.0.0.1/", kind: "og" },
  ];
  const ophalen = async (taken: typeof jobs) => (await (await fetcher.fetch(new Request("https://do/", { method: "POST", body: JSON.stringify({ jobs: taken, since: nu - 86400000 }) }))).json()) as any[];
  const resultaten = await ophalen(jobs);
  assert.equal(resultaten[0].total, 2);
  assert.deepEqual(resultaten[0].entries.map((e: any) => e.t), ["Vandaag"]);
  assert.deepEqual(resultaten[1].json, { waarde: 42 });
  assert.match(resultaten[2].err, /HTML i.p.v. feed/);
  assert.equal(resultaten[3].status, 404);
  assert.equal(resultaten[4].text, "https://nieuws.nl/foto.jpg");
  assert.equal(resultaten[4].kvWrites, 1);
  assert.match(resultaten[5].err, /geweigerde externe URL/);
  const aantal = verzoeken.length;
  assert.equal((await ophalen([jobs[4]]))[0].text, "https://nieuws.nl/foto.jpg");
  assert.equal(verzoeken.length, aantal);
  const job = { kind: "insta", url: "https://instagram.com/test" } as any;
  const goed = { ok: true, entries: [{ t: "bewaard" }], videos: [], newest: nu } as any;
  await fetcher.mem(job, goed, nu - 1000);
  const fout = { ok: false, status: 500 } as any;
  assert.deepEqual(await fetcher.mem(job, fout, nu - 1000), { ...fout, cachedAt: nu, entries: goed.entries, videos: [], newest: nu });
  assert.deepEqual(await fetcher.mem(job, fout, nu + 1), fout);
} finally {
  Date.now = oudeNow;
  globalThis.fetch = oudeFetch;
}
console.log("✓ Fetcher bouwt feeds op en bewaart resultaten lokaal");
