// #480: YouTube-feedstoring: kanarie, overslaan en bronstat-telling. Alleen lokale doubles, geen netwerk.
import assert from "node:assert/strict";
import { ytCanary, ytStoringStatus, onbereikbaar, isYtFeed, YT_STORING_TEKST } from "../worker/src/ytstoring";
import { jobGroep } from "../worker/src/tier";

let n = 0;
const t = async (naam: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", naam); };

const yt = (id: string) => ({ url: `https://www.youtube.com/feeds/videos.xml?channel_id=UC${id}`, kind: "feed" });
const due = [{ url: "https://nu.nl/rss", kind: "feed" }, yt("a"), yt("b"), yt("c")];
type R = { url: string; ok: boolean; status: number };
const haler = (status: number | "fout") => {
  const gehaald: string[] = [];
  const haal = async (js: { url: string }[]): Promise<R[]> => {
    for (const j of js) gehaald.push(j.url);
    if (status === "fout") throw new Error("netwerk");
    return js.map((j) => ({ url: j.url, ok: status === 200, status }));
  };
  return { haal, gehaald };
};

await t("canary 404: eerste YouTube-feed opgehaald, de rest overgeslagen", async () => {
  const h = haler(404);
  const r = await ytCanary(due, h.haal);
  assert.deepEqual(h.gehaald, [yt("a").url]);
  assert.deepEqual(r.storing, { status: 404, overgeslagen: 2 });
  assert.deepEqual(r.overslaan.map((j) => j.url), [yt("b").url, yt("c").url]);
  assert.equal(r.rest.length, 0);
});

await t("canary 500/503 is een storing; netwerkfout/time-out (status 0) niet", async () => {
  assert.equal((await ytCanary(due, haler(500).haal)).storing?.status, 500);
  assert.equal((await ytCanary(due, haler(503).haal)).storing?.status, 503);
  const f = await ytCanary(due, haler("fout").haal);
  assert.equal(f.storing, null);
  assert.equal(f.overslaan.length, 0);
  assert.deepEqual(f.rest.map((j) => j.url), [yt("b").url, yt("c").url]);
  const w = await ytCanary(due, async (js) => js.map((j) => ({ url: j.url, ok: false, status: 0 })));
  assert.equal(w.storing, null);
});

await t("canary 200: rest wordt opgehaald, kanarie niet dubbel, geen storing", async () => {
  const h = haler(200);
  const r = await ytCanary(due, h.haal);
  assert.equal(r.storing, null);
  assert.deepEqual(h.gehaald, [yt("a").url]);
  assert.deepEqual(r.rest.map((j) => j.url), [yt("b").url, yt("c").url]);
  assert.equal(r.canary.length, 1);
  assert.equal(r.overslaan.length, 0);
});

await t("gezonde kanarie: elke YouTube-feed precies één keer opgehaald, niet-YouTube wacht niet op de kanarie", async () => {
  const volgorde: string[] = [], gehaald: string[] = [];
  let open!: () => void;
  const poort = new Promise<void>((r) => { open = r; });
  const haal = async (js: { url: string }[]): Promise<R[]> => {
    for (const j of js) { volgorde.push(`start ${j.url}`); gehaald.push(j.url); }
    if (js[0].url === yt("a").url) await poort; // trage kanarie
    return js.map((j) => ({ url: j.url, ok: true, status: 200 }));
  };
  // zelfde samenstelling als worker/src/index.ts: niet-YouTube direct, YouTube-rest na de kanarie
  const nietYt = due.filter((j) => !isYtFeed(j.url));
  const haalNietYt = async () => { const r = await haal(nietYt); open(); return r; };
  const haalYt = async () => { const yk = await ytCanary(due, haal); return [...yk.canary, ...(yk.rest.length ? await haal(yk.rest) : [])]; };
  const [a, b] = await Promise.all([haalNietYt(), haalYt()]);
  assert.ok(volgorde.indexOf("start https://nu.nl/rss") < volgorde.indexOf(`start ${yt("b").url}`));
  assert.equal(gehaald.filter(isYtFeed).length, due.filter((j) => isYtFeed(j.url)).length);
  assert.equal(new Set(gehaald).size, gehaald.length);
  assert.equal(a.length + b.length, due.length);
});

await t("geen YouTube-feeds in deze run: geen kanarie, niets gehaald", async () => {
  const h = haler(404);
  const r = await ytCanary([due[0]], h.haal);
  assert.equal(h.gehaald.length, 0);
  assert.equal(r.storing, null);
});

await t("alleen echte YouTube-kanaalfeeds tellen; 403/429 is geen storing", () => {
  assert.ok(isYtFeed(yt("a").url));
  assert.ok(!isYtFeed("https://nu.nl/rss"));
  assert.equal(jobGroep(yt("a")), "zwaar");
  assert.ok(ytStoringStatus({ url: "", ok: false, status: 404 }));
  assert.ok(ytStoringStatus({ url: "", ok: false, status: 500 }));
  assert.ok(!ytStoringStatus({ url: "", ok: false, status: 0 }));
  assert.ok(!ytStoringStatus({ url: "", ok: false, status: 429 }));
  assert.ok(!ytStoringStatus({ url: "", ok: false, status: 403 }));
  assert.ok(!ytStoringStatus({ url: "", ok: true, status: 200 }));
});

await t("bronstats: zuivere YouTube-bron is storing; gemengde bron telt YouTube niet als onbereikbaar", () => {
  const set = new Set([yt("a").url, yt("b").url]);
  const zuiver = onbereikbaar([{ url: yt("a").url, ok: false }], set);
  assert.deepEqual(zuiver, { totaal: 0, fout: 0, storing: true, alleenYt: true });
  // vvd: 2 gewone feeds (1 ok), 1 YouTube in storing => geen "1 van 3"
  const gemengd = onbereikbaar([{ url: "https://a/rss", ok: true }, { url: "https://b/rss", ok: true }, { url: yt("a").url, ok: false }], set);
  assert.deepEqual(gemengd, { totaal: 2, fout: 0, storing: true, alleenYt: false });
  // een echt kapotte gewone feed blijft zichtbaar
  assert.equal(onbereikbaar([{ url: "https://a/rss", ok: false }, { url: yt("a").url, ok: false }], set).fout, 1);
  // zonder storing verandert er niets
  assert.deepEqual(onbereikbaar([{ url: "https://a/rss", ok: true }, { url: yt("c").url, ok: false }], set), { totaal: 2, fout: 1, storing: false, alleenYt: false });
  assert.equal(YT_STORING_TEKST, "YouTube-feedstoring (tijdelijk)");
});

console.log(`${n} tests ok`);
