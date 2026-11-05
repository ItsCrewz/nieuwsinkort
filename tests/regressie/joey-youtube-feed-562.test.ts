import assert from "node:assert/strict";
import { Fetcher } from "../../worker/src/index";
import { ytCanary } from "../../worker/src/ytstoring";

const primair = "https://www.youtube.com/feeds/videos.xml?channel_id=UCHTtspK-G7Wt68awRpTSkiw";
const fallback = "https://www.youtube.com/feeds/videos.xml?playlist_id=UUHTtspK-G7Wt68awRpTSkiw";
const datum = new Date().toISOString();
const xml = `<feed><entry><yt:videoId>abcdefghijk</yt:videoId><title>Kort nieuws</title><link rel="alternate" href="https://www.youtube.com/watch?v=abcdefghijk"/><published>${datum}</published></entry></feed>`;
const job = { url: primair, kind: "feed", label: "PowNews" };
const fetcher = new Fetcher({ storage: {} } as any, {} as any);
const echteFetch = globalThis.fetch;
const calls: string[] = [];
let primaireStatus = 404, fallbackStatus = 200;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input); calls.push(url);
  const status = url === primair ? primaireStatus : url === fallback ? fallbackStatus : 200;
  return new Response(status === 200 ? xml : "niet gevonden", { status });
}) as typeof fetch;
const haal = async (jobs: typeof job[]) => {
  const res = await fetcher.fetch(new Request("https://do/f", { method: "POST", body: JSON.stringify({ jobs, since: 0 }) }));
  return await res.json() as { url: string; ok: boolean; status: number; err?: string; ytPad?: string; entries?: unknown[]; videos?: unknown[] }[];
};
try {
  let [r] = await haal([job]);
  assert.deepEqual(calls, [primair, fallback]);
  assert.equal(r.ytPad, "fallback");
  assert.equal(r.entries?.length, 1);
  assert.equal(r.videos?.length, 1);
  calls.length = 0; primaireStatus = 200;
  [r] = await haal([job]);
  assert.deepEqual(calls, [primair]);
  assert.equal(r.ytPad, "primair");
  calls.length = 0; primaireStatus = 404; fallbackStatus = 404;
  const kanarie = await ytCanary([job], haal);
  assert.deepEqual(calls, [primair, fallback]);
  assert.equal(kanarie.canary[0].err, "HTTP 404");
  assert.equal(kanarie.storing?.status, 404);
  const [andere] = await haal([{ ...job, url: "https://voorbeeld.nl/rss" }]);
  assert.equal(andere.ok, true);
  console.log("✓ YouTube-fallback, herstel en mislukking");
} finally { globalThis.fetch = echteFetch; }
