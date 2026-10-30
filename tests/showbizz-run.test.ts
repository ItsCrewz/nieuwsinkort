import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import "./sportcat.test";
import "./showcat.test";
import { Runner } from "../worker/src/index";
import { nietAlsNieuws } from "../worker/src/showcat";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
await t("showbizz: RTL Boulevard-site telt als nieuws, YouTube niet; algemene feeds geven showbizzverhalen aan Showbizz", async () => {
  assert.equal(nietAlsNieuws("showbizz", "YouTube", "https://www.youtube.com/feeds/videos.xml?channel_id=UC2Jbya_u-rQ0xBNHBYXvpTg"), true);
  assert.equal(nietAlsNieuws("showbizz", "YouTube, Instagram", "https://kg.meowing.de/rtlboulevard/atom.xml"), true);
  assert.equal(nietAlsNieuws("showbizz", "YouTube", "https://www.rtl.nl/boulevard/rss.xml"), false);
  assert.equal(nietAlsNieuws("politiek", "YouTube", "https://www.youtube.com/feeds/videos.xml?channel_id=x"), false);
  const nu = Date.now();
  const e = (l: string, t: string, m: number) => ({ t, l, s: "", d: nu - m * 60e3 });
  const feed = (url: string, entries: any[]) => ({ url, ok: true, entries, videos: [] });
  const nl = [e("https://www.nu.nl/binnenland/1/kabinet-praat-over-begroting.html", "Kabinet praat over de begroting van volgend jaar", 20), e("https://www.rtl.nl/nieuws/politiek/artikel/2/x", "Kamer debatteert over zorgpremie", 21)];
  const feeds: Record<string, any> = {
    "https://www.nu.nl/rss": feed("https://www.nu.nl/rss", [...nl, e("https://www.nu.nl/achterklap/6414919/halle-berry-verliest-voogdij-over-zoon.html", "Halle Berry verliest voogdij over zoon voorlopig aan ex-man", 10)]),
    "https://www.rtl.nl/boulevard/rss.xml": feed("https://www.rtl.nl/boulevard/rss.xml", [e("https://www.rtl.nl/boulevard/artikel/5661954/wilfred-genee-teleurgesteld", "Wilfred Genee teleurgesteld na interview met Jaimie Vaes", 5)]),
    "https://www.youtube.com/feeds/videos.xml?channel_id=UC2Jbya_u-rQ0xBNHBYXvpTg": feed("x", [e("https://www.youtube.com/shorts/abcdefghijk", "YouTube-short van RTL Boulevard", 5)]),
  };
  const bronnen = { groepen: [
    { id: "nl", bronnen: [{ id: "nu", naam: "NU.nl", feeds: [{ url: "https://www.nu.nl/rss" }] }] },
    { id: "showbizz", bronnen: [{ id: "rtlboulevard", naam: "RTL Boulevard", info: "YouTube", feeds: [{ url: "https://www.rtl.nl/boulevard/rss.xml" }, { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC2Jbya_u-rQ0xBNHBYXvpTg" }] }] },
  ] };
  const kv = new Map<string, string>();
  const runEnv: any = {
    SITE: "https://lokaal", MODEL: "m", NIEUWS: { get: async (k: string, tp?: string) => { const v = kv.get(k); return v == null ? null : tp === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { kv.set(k, v); } },
    FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(JSON.parse(init.body).jobs.map((j: any) => feeds[j.url] || { url: j.url, ok: true, entries: [], videos: [] })) }) },
    BUDGET_DO: undefined,
  };
  const echte = globalThis.fetch;
  globalThis.fetch = (async (u: any) => String(u).includes("/bronnen.json") ? Response.json(bronnen) : new Response("nee", { status: 404 })) as any;
  try {
    const data = new Map<string, unknown>();
    const ctx: any = { storage: { get: async (k: string) => data.get(k), put: async (k: string, v: unknown) => { data.set(k, v); }, setAlarm: async () => {} }, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() };
    await new Runner(ctx, runEnv).run(true);
  } finally { globalThis.fetch = echte; }
  const uur = JSON.parse(kv.get("uur") || "{}");
  const cat = (frag: string) => uur.items.find((i: any) => (i.bronnen || []).some((b: any) => b.href.includes(frag)))?.cat;
  assert.equal(cat("halle-berry"), "showbizz");
  assert.equal(cat("wilfred-genee"), "showbizz");
  assert.equal(cat("kabinet-praat"), "nl");
  assert.equal(cat("youtube.com/shorts"), undefined);
});

console.log(`\n${n} showbizz-run-tests geslaagd`);
