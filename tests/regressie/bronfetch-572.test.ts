import assert from "node:assert/strict";
import { Fetcher } from "../../worker/src/index";

const bleep = "https://www.bleepingcomputer.com/feed/";
const cisa = "https://www.cisa.gov/cybersecurity-advisories/all.xml";
const testtijd = Date.parse("2025-06-15T12:00:00Z");
const xml = `<rss><channel><item><title>Beveiligingsnieuws</title><link>https://www.bleepingcomputer.com/news/bericht/</link><pubDate>${new Date(testtijd).toUTCString()}</pubDate></item></channel></rss>`;
const fetcher = new Fetcher({ storage: {} } as any, {} as any);
const echteFetch = globalThis.fetch;
const echteDateNow = Date.now;
Date.now = () => testtijd;
const aanvragen: { url: string; ua: string }[] = [];
let herstel = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  aanvragen.push({ url, ua: new Headers(init?.headers).get("User-Agent") || "" });
  const status = url === cisa ? 404 : herstel && aanvragen.filter((a) => a.url === bleep).length === 2 ? 200 : 403;
  return new Response(status === 200 ? xml : "fout", { status });
}) as typeof fetch;
const haal = async (url: string) => {
  const response = await fetcher.fetch(new Request("https://do/f", { method: "POST", body: JSON.stringify({ jobs: [{ url, kind: "feed" }], since: 0 }) }));
  return (await response.json() as { ok: boolean; status: number; err?: string; entries?: unknown[] }[])[0];
};
try {
  const mislukt = await haal(bleep);
  assert.equal(mislukt.status, 403);
  assert.equal(mislukt.err, "HTTP 403");
  assert.equal(aanvragen.length, 2);
  assert.notEqual(aanvragen[0].ua, aanvragen[1].ua);
  assert.match(aanvragen[1].ua, /^Mozilla\//);
  aanvragen.length = 0;
  const ontbreekt = await haal(cisa);
  assert.equal(ontbreekt.status, 404);
  assert.equal(ontbreekt.err, "HTTP 404");
  assert.equal(aanvragen.length, 1);
  aanvragen.length = 0;
  herstel = true;
  const gelukt = await haal(bleep);
  assert.equal(gelukt.ok, true);
  assert.equal(gelukt.entries?.length, 1);
  assert.equal(aanvragen.length, 2);
  console.log("ok - feedfetch meldt fouten en verwerkt een geslaagde herpoging");
} finally { globalThis.fetch = echteFetch; Date.now = echteDateNow; }
