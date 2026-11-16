// #572: 403/404 van één bron stopt de run niet en de HTTP-status komt in de bronfout; CISA/BleepingComputer krijgen bij 403 browser-headers.
import assert from "node:assert/strict";
import { runJob, hostHeaders } from "../worker/src/index";

const echte = globalThis.fetch;
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Kwetsbaarheid</title><link>https://www.cisa.gov/a</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
const oudeTimeout = globalThis.setTimeout;
try {
  // sleep() wachten overslaan
  (globalThis as any).setTimeout = (f: any) => oudeTimeout(f, 0);
  const gezien: Record<string, string>[] = [];
  globalThis.fetch = (async (u: any, init: any) => {
    const h = init?.headers || {};
    gezien.push(h);
    if (String(u).includes("bleepingcomputer")) return new Response("", { status: 403 });
    if (String(u).includes("cisa.gov")) return h["User-Agent"]?.startsWith("Mozilla") && h.Referer ? new Response(rss) : new Response("", { status: 403 });
    return new Response("", { status: 404 });
  }) as any;

  const bleeping = await runJob({ url: "https://www.bleepingcomputer.com/feed/", kind: "feed" }, 0);
  assert.equal(bleeping.ok, false);
  assert.equal(bleeping.code, "SRC_HTTP");
  assert.equal(bleeping.status, 403);
  assert.equal(bleeping.err, "HTTP 403");

  const cisa = await runJob({ url: "https://www.cisa.gov/news.xml", kind: "feed" }, 0);
  assert.equal(cisa.ok, true, "CISA komt binnen met browser-headers");
  assert.equal(cisa.total, 1);
  assert.equal(gezien.at(-1)!.Referer, "https://www.cisa.gov/");

  const weg = await runJob({ url: "https://anders.nl/rss", kind: "feed" }, 0);
  assert.equal(weg.status, 404);
  assert.equal(weg.code, "SRC_HTTP");

  assert.deepEqual(hostHeaders("https://anders.nl/rss"), {});
  assert.match(hostHeaders("https://www.cisa.gov/x.json").Accept, /^application\/json/);
  console.log("✓ 403/404 geeft foutcode en status; run gaat door; CISA krijgt browser-headers");
} finally { globalThis.fetch = echte; globalThis.setTimeout = oudeTimeout; }
