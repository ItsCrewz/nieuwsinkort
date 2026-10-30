import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import "./sportcat.test";
import "./showcat.test";
import worker, { Runner, kiesVoorAI } from "../worker/src/index";
import { nietAlsNieuws } from "../worker/src/showcat";
import { Budget } from "../worker/src/budget";
import { onRequestPost as svPost } from "../functions/samenvatting";
import { videoSlug } from "../src/slug";
import { buildWeer, KNMI_VERW, OM_URL } from "../worker/src/weer";
import { simpelWeer, summarize, inHetKort, verdiep } from "../worker/src/ai";
import { parseYouTube, soortVan, YT_NIEUWS } from "../worker/src/videos";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
await t("YouTube-nieuwskanalen bevatten de nieuwe kanalen", async () => {
  assert.equal(YT_NIEUWS["NOS Stories"], "UCoakeH4bmdUYtptWdmoUrRQ");
  assert.equal(YT_NIEUWS["Nieuwsuur"], "UCExcZNwh_3Mwm4fF4VSiu2w");
  assert.equal(YT_NIEUWS["Omroep PowNed"], "UCihqgpWn_ns1gJUdhNLsSMQ");
  assert.equal(YT_NIEUWS["Radar"], "UCGUhzuD1eYIgJoSGe0c_rNg");
});
await t("Instagram en Kittygram zijn geen bronnen meer; Haarlem105 gebruikt YouTube", async () => {
  const feeds = JSON.parse(readFileSync("scripts/pipeline/feeds.json", "utf8"));
  const bronnen = JSON.parse(readFileSync("public/bronnen.json", "utf8"));
  const urls = [...feeds.map((f: any) => f.url), ...bronnen.groepen.flatMap((g: any) => g.bronnen.flatMap((b: any) => (b.feeds || []).map((f: any) => f.url)))];
  assert.ok(urls.every((url: string) => !/(?:^|\.)kg\.meowing\.de$|(?:^|\.)instagram\.com$/i.test(new URL(url).hostname)));
  assert.ok(feeds.some((f: any) => f.cat === "haarlem" && f.naam === "Haarlem105 (YouTube)" && f.werkt && f.url === `https://www.youtube.com/feeds/videos.xml?channel_id=${YT_NIEUWS.Haarlem105}`));
  assert.equal(YT_NIEUWS.Haarlem105, "UCFDVl_p6fwkloGr8lraSZgQ");
  const worker = readFileSync("worker/src/index.ts", "utf8");
  assert.doesNotMatch(worker, /iPhone.*Safari|IG_UA|runInsta|igGet/);
  const script = readFileSync("scripts/pipeline/filmpjes.py", "utf8");
  assert.match(script, /"Haarlem105": "UCFDVl_p6fwkloGr8lraSZgQ"/);
  assert.doesNotMatch(script, /IG_ACCOUNTS|IG_POLITIEK|def instagram\(/);
});
await t("YouTube-Short krijgt een embed en de soort short", async () => {
  const xml = `<feed><entry><yt:videoId>abcdefghijk</yt:videoId><title>Kort nieuws</title><link rel="alternate" href="https://www.youtube.com/shorts/abcdefghijk"/><published>2026-10-29T12:00:00Z</published></entry></feed>`;
  const videos = parseYouTube(xml, "NOS Stories", Date.parse("2026-10-28T00:00:00Z"), () => "13:00");
  assert.equal(videos.length, 1);
  assert.equal(videos[0].embed, "https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0");
  assert.equal(soortVan(videos[0]), "short");
});
await t("Sport- en autokanalen en NOS Sport-Short", async () => {
  assert.equal(YT_NIEUWS["NOS Sport"], "UCT4oPufBQa0f6C67Fw_HXNg");
  assert.equal(YT_NIEUWS["Ziggo Sport"], "UCueOZEvMffxjJyVO1fGiJNQ");
  assert.equal(YT_NIEUWS["ESPN NL"], "UCXnPiEv1DoUCDAqDUXT9shQ");
  assert.equal(YT_NIEUWS["OnsOranje"], "UCpnmJcBhJqKIHFkKvgdkdMQ");
  assert.equal(YT_NIEUWS["FORMULA 1"], "UCB_qr75-ydFVKSF9Dmo6izg");
  assert.equal(YT_NIEUWS["AutoWeek"], "UCzToShYR6Sw_k1i6FsdEr6g");
  assert.equal(YT_NIEUWS["Autovisie"], "UCAkqAwuyz_qu3vfgAMQPCBw");
  const xml = `<feed><entry><yt:videoId>abcdefghijk</yt:videoId><title>Sport</title><link rel="alternate" href="https://www.youtube.com/shorts/abcdefghijk"/><published>2026-10-29T12:00:00Z</published></entry></feed>`;
  const videos = parseYouTube(xml, "NOS Sport", Date.parse("2026-10-28T00:00:00Z"), () => "13:00");
  assert.equal(videos.length, 1);
  assert.equal(videos[0].embed, "https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0");
  assert.equal(soortVan(videos[0]), "short");
});
const sleutel = "uitsluitend-test-fixture";
let starts = 0;
const env: any = {
  RUN_KEY: sleutel,
  RUNNER: { idFromName: () => "runner", get: () => ({ fetch: async () => { starts++; return Response.json({ ok: true }); } }) },
  NIEUWS: { get: async () => "{}", put: async () => {} },
};
await t("Worker weigert URL-sleutel, onjuiste of ontbrekende Bearer en ontbrekend secret", async () => {
  for (const pad of ["/run", "/uur"]) {
    for (const headers of [{}, { Authorization: "Bearer fout" }, { Authorization: `Basic ${sleutel}` }]) {
      assert.equal((await worker.fetch(new Request(`https://lokaal${pad}?key=${sleutel}`, { headers }), env)).status, 403);
    }
    assert.equal((await worker.fetch(new Request(`https://lokaal${pad}`, { headers: { Authorization: `Bearer ${sleutel}` } }), { ...env, RUN_KEY: undefined })).status, 403);
  }
  assert.equal(starts, 0);
});
await t("Worker accepteert Bearer voor run en uur", async () => {
  for (const pad of ["/run", "/uur"]) assert.equal((await worker.fetch(new Request(`https://lokaal${pad}`, { headers: { Authorization: `Bearer ${sleutel}` } }), env)).status, 200);
  assert.equal(starts, 1);
});
function runner() {
  const data = new Map<string, unknown>();
  const ctx: any = { storage: { get: async (k: string) => data.get(k), put: async (k: string, v: unknown) => { data.set(k, v); } }, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() };
  return { r: new Runner(ctx, env), data };
}
await t("Runner weigert force binnen tien minuten na gewone of geforceerde run", async () => {
  const { r, data } = runner();
  let runs = 0;
  r.run = async () => { runs++; return { ok: true } as any; };
  assert.equal((await r.fetch(new Request("https://do/run"))).status, 200);
  assert.equal((await r.fetch(new Request("https://do/run?force=1"))).status, 429);
  data.set("laatsteRun", Date.now() - 10 * 60e3);
  assert.equal((await r.fetch(new Request("https://do/run?force=1"))).status, 200);
  assert.equal((await r.fetch(new Request("https://do/run?force=1"))).status, 429);
  assert.equal(runs, 2);
});
await t("Runner logt stack, begrenst foutmelding en bewaart limiet na fout", async () => {
  const { r } = runner();
  const fout = new Error("x".repeat(250));
  r.run = async () => { throw fout; };
  const oud = console.error;
  const logs: unknown[] = [];
  console.error = (e) => { logs.push(e); };
  try {
    const res = await r.fetch(new Request("https://do/run?force=1"));
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { ok: false, err: "x".repeat(200) });
    assert.deepEqual(logs, [fout.stack]);
    assert.equal((await r.fetch(new Request("https://do/run?force=1"))).status, 429);
  } finally { console.error = oud; }
});
// ---- Budget-DO: slot, reservering, verrekening en uurrem (in-memory opslag, geen Cloudflare)
function budget(kv: Map<string, string> = new Map()) {
  const data = new Map<string, unknown>();
  const storage = {
    get: async (k: string) => data.get(k),
    put: async (k: string, v: unknown) => { data.set(k, v); },
    delete: async (k: string | string[]) => { for (const x of [k].flat()) data.delete(x); },
    list: async ({ prefix }: { prefix: string }) => new Map([...data].filter(([k]) => k.startsWith(prefix))),
  };
  const nvKv = { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { kv.set(k, v); } };
  const b = new Budget({ storage } as any, { NIEUWS: nvKv } as any);
  const call = async (actie: string, body: unknown): Promise<any> => (await b.fetch(new Request(`https://do/${actie}`, { method: "POST", body: JSON.stringify(body) }))).json();
  return { b, data, kv, call };
}
const res = (o: any = {}) => ({ datum: "2026-10-30", uur: "2026-10-30T10", nieuws: 3000, budget: 9000, reserve: 2000, marge: 30, schatting: 100, ...o });
await t("Budget: slot claimen, vrijgeven en verlopen", async () => {
  const { call, data } = budget();
  const a = (await call("claim", { id: "vid-1" })).tok;
  assert.ok(a);
  assert.equal((await call("claim", { id: "vid-1" })).tok, null, "bezig");
  assert.ok((await call("claim", { id: "vid-2" })).tok, "ander id kan wel");
  await call("vrij", { id: "vid-1", tok: "fout" });
  assert.equal((await call("claim", { id: "vid-1" })).tok, null, "verkeerd token geeft niets vrij");
  await call("vrij", { id: "vid-1", tok: a });
  assert.ok((await call("claim", { id: "vid-1" })).tok, "na vrijgeven weer vrij");
  (data.get("slot:vid-1") as any).tot = Date.now() - 1;
  assert.ok((await call("claim", { id: "vid-1" })).tok, "verlopen slot is vrij");
});
await t("Budget: reserveren, boven budget geweigerd, verrekenen met spiegel in KV", async () => {
  const { call, kv } = budget();
  assert.deepEqual(await call("reserveer", res()), { ok: true, video: 100 });
  assert.equal(kv.get("vid-neurons:2026-10-30"), "100");
  // 3000 + 100 + 2000 + 30 + schatting > 9000 vanaf schatting 3871
  assert.equal((await call("reserveer", res({ schatting: 3870 }))).ok, true);
  const geweigerd = await call("reserveer", res({ schatting: 100 }));
  assert.deepEqual([geweigerd.ok, geweigerd.reden], [false, "budget"]);
  assert.equal((await call("stand", { datum: "2026-10-30" })).video, 3970, "geweigerd verandert niets");
  assert.equal((await call("verreken", { datum: "2026-10-30", delta: -70.04 })).video, 3900);
  assert.equal(kv.get("vid-neurons:2026-10-30"), "3900");
  assert.equal((await call("verreken", { datum: "2026-10-30", delta: -1e9 })).video, 0, "nooit negatief");
});
await t("Budget: zaait de dagstand uit de KV-spiegel", async () => {
  const { call } = budget(new Map([["vid-neurons:2026-10-30", "500"]]));
  assert.equal((await call("stand", { datum: "2026-10-30" })).video, 500);
  assert.equal((await call("reserveer", res({ schatting: 10 }))).video, 510);
});
await t("Budget: gelijktijdige reserveringen met trage zaad overschrijven elkaar niet", async () => {
  const kv = new Map([["vid-neurons:2026-10-30", "500"]]);
  const { b, call } = budget(kv);
  const echt = (b as any).env.NIEUWS.get;
  (b as any).env.NIEUWS.get = async (k: string) => { await new Promise((r) => setTimeout(r, 20)); return echt(k); };
  const uit = await Promise.all([1, 2, 3, 4, 5].map(() => call("reserveer", res({ schatting: 10 }))));
  assert.deepEqual(uit.map((x) => x.video).sort((x, y) => x - y), [510, 520, 530, 540, 550]);
  assert.equal(kv.get("vid-neurons:2026-10-30"), "550");
});
await t("Budget: uurrem staat op 30 en geldt per uur", async () => {
  const { call, data } = budget();
  for (let i = 0; i < 30; i++) assert.equal((await call("reserveer", res({ schatting: 1 }))).ok, true);
  const vol = await call("reserveer", res({ schatting: 1 }));
  assert.deepEqual([vol.ok, vol.reden], [false, "druk"]);
  assert.equal((await call("reserveer", res({ schatting: 1, uur: "2026-10-30T11" }))).ok, true, "volgend uur weer ruimte");
  assert.equal([...data.keys()].filter((k) => k.startsWith("uur:2026-10-30T")).length, 2);
  await call("reserveer", res({ datum: "2026-10-31", uur: "2026-10-31T06", schatting: 1 }));
  assert.deepEqual([...data.keys()].filter((k) => k.startsWith("uur:") || k.startsWith("video:")).sort(), ["uur:2026-10-31T06", "video:2026-10-31"], "oude dag opgeruimd");
});
await t("Budget: onbekende actie en GET worden geweigerd", async () => {
  const { b } = budget();
  assert.equal((await b.fetch(new Request("https://do/claim"))).status, 405);
  assert.equal((await b.fetch(new Request("https://do/x", { method: "POST", body: "{}" }))).status, 404);
});

// ---- /samenvatting met en zonder DO-binding (mock-KV, mock-AI, geen netwerk)
function sv(binding: boolean) {
  const m = new Map<string, string>(), schrijf: string[] = [], calls: string[] = [];
  const video = { titel: "Testfilmpje", href: "https://x.com/a/status/1", embed: "https://video.twimg.com/a.mp4", bron: "X" };
  m.set("uur", JSON.stringify({ filmpjes: [video], dumpert: [] }));
  const NIEUWS = {
    get: async (k: string, ty?: string) => { await 0; const v = m.get(k); return v == null ? null : ty === "json" ? JSON.parse(v) : v; },
    put: async (k: string, v: string) => { await 0; schrijf.push(k); m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
  };
  const bud = budget(m);
  // een echte DO verwerkt de aanroepen één voor één (input gates); de ketting bootst dat na
  let rij: Promise<unknown> = Promise.resolve();
  const ns = { idFromName: () => "dag", get: () => ({ fetch: (u: string, i: RequestInit) => { const r = rij.then(() => bud.b.fetch(new Request(u, i))); rij = r.catch(() => {}); return r; } }) };
  const env: any = { NIEUWS, ASSETS: { fetch: async () => new Response("{}") }, ...(binding ? { BUDGET_DO: ns } : {}),
    AI: { run: async (model: string) => { calls.push(model); await new Promise((r) => setTimeout(r, 5)); return model.includes("whisper") ? { text: "dit is een lange gesproken tekst over het nieuws van vandaag", transcription_info: { duration: 60 } } : { response: "", usage: { prompt_tokens: 10, completion_tokens: 1 } }; } } };
  const post = (o: any = {}, h: Record<string, string> = { "Content-Type": "application/json" }) =>
    svPost({ request: new Request("https://nieuwsinkort.test/samenvatting", { method: "POST", headers: h, body: JSON.stringify({ id: videoSlug(video as any), ...o }) }), env });
  return { env, m, schrijf, calls, post, bud };
}
const echteFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response(new Uint8Array(2e6), { status: 200 })) as any;
try {
  await t("samenvatting met DO-binding: slot, reservering en teller zitten in de DO, niet in KV", async () => {
    const a = sv(true);
    const rs = await Promise.all(Array.from({ length: 20 }, () => a.post()));
    const js: any[] = await Promise.all(rs.map((r) => r.json()));
    assert.equal(a.calls.filter((c) => c.includes("whisper")).length, 1, "20 gelijktijdige POST's: hooguit 1 Whisper-aanroep");
    assert.ok(js.filter((j) => j.code === "bezig").length >= 19);
    assert.ok(js.every((j) => !("why" in j)));
    assert.ok(![...a.m.keys()].some((k) => k.startsWith("vs-bezig:") || k.startsWith("vs-uur:")), "geen KV-slot of -teller");
    assert.ok([...a.bud.data.keys()].some((k) => k.startsWith("uur:")), "uurteller in DO");
    assert.equal([...a.bud.data.keys()].filter((k) => k.startsWith("slot:")).length, 0, "slot is vrijgegeven");
    const spiegel = [...a.m].find(([k]) => k.startsWith("vid-neurons:"));
    assert.ok(spiegel && +spiegel[1] > 0, "KV-spiegel vid-neurons bijgewerkt voor de uur-Worker");
    assert.equal(((await (await a.post()).json()) as any).cached, true, "foutcache blijft werken");
  });
  await t("samenvatting met DO-binding: volle uurrem geeft druk zonder AI; 415 en 403 raken de DO niet", async () => {
    const a = sv(true);
    const d = new Date(); const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
    a.bud.data.set(`uur:${p.year}-${p.month}-${p.day}T${+p.hour}`, 30);
    assert.equal(((await (await a.post()).json()) as any).code, "druk");
    assert.equal(a.calls.length, 0);
    const b = sv(true);
    assert.equal((await b.post({}, { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await b.post({}, { "Content-Type": "application/json", Origin: "https://evil.example" })).status, 403);
    assert.equal(b.bud.data.size, 0);
  });
  await t("samenvatting met DO-binding: onbereikbare DO geeft 503 zonder cache of AI", async () => {
    const a = sv(true);
    a.env.BUDGET_DO.get = () => ({ fetch: async () => { throw new Error("DO weg"); } });
    const oud = console.error; console.error = () => {};
    try { const r = await a.post(); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { ok: false, code: "fout", fout: "Samenvatten lukt even niet. Probeer het later nog eens." }); } finally { console.error = oud; }
    assert.equal(a.calls.length, 0);
    assert.ok(![...a.m.keys()].some((k) => k.startsWith("vs:")), "niet gecachet");
  });
  await t("samenvatting zonder DO-binding valt terug op KV-slot en KV-uurteller", async () => {
    const a = sv(false);
    const js: any[] = await Promise.all((await Promise.all(Array.from({ length: 10 }, () => a.post()))).map((r) => r.json()));
    assert.equal(a.calls.filter((c) => c.includes("whisper")).length, 1);
    assert.ok(js.filter((j) => j.code === "bezig").length >= 9);
    assert.ok([...a.m.keys()].some((k) => k.startsWith("vs-uur:")), "KV-uurteller");
    assert.ok([...a.m.keys()].some((k) => k.startsWith("vid-neurons:")), "KV-neuronen");
    assert.ok(!a.m.has("vs-bezig:" + videoSlug({ titel: "Testfilmpje", href: "https://x.com/a/status/1", embed: "https://video.twimg.com/a.mp4", bron: "X" } as any)), "slot vrijgegeven");
    assert.equal(a.bud.data.size, 0, "DO ongebruikt");
  });
} finally { globalThis.fetch = echteFetch; }

// ---- landelijk weer (#37): lokale fixtures, geen netwerk, geen echte AI
const st = (stationname: string, regio: string, temperature: number | null, weatherdescription = "Zwaar bewolkt", feeltemperature = temperature) => ({ stationname, regio, temperature, feeltemperature, weatherdescription });
const brFix = {
  actual: { stationmeasurements: [st("Meetstation Schiphol", "Amsterdam", 10), st("Meetstation Eelde", "Groningen", 8, "Mist"), st("Meetstation Maastricht", "Maastricht", 14, "Zwaar bewolkt"), st("Meetstation De Bilt", "Utrecht", 12), st("Zeeplatform F-3", "Noordzee", 25), st("Meetstation Kapot", "Venlo", null)] },
  forecast: { fivedayforecast: [{ day: "2026-10-30T00:00:00", mintemperature: "7", maxtemperature: "13", rainChance: 10, windDirection: "o", wind: 3, weatherdescription: "Zwaar bewolkt" }, { day: "2026-10-31T00:00:00", mintemperature: "6", maxtemperature: "13", weatherdescription: "Zwaar bewolkt" }] },
};
const punt = (t: number, code: number, mn: number, mx: number, kans: number, wind: number, richting: number) => ({ current: { temperature_2m: t, apparent_temperature: t - 1, weather_code: code }, daily: { time: ["2026-10-30", "2026-10-31"], temperature_2m_min: [mn, mn], temperature_2m_max: [mx, mx], precipitation_probability_max: [kans, kans], weather_code: [code, code], wind_speed_10m_max: [wind, wind], wind_direction_10m_dominant: [richting, richting] } });
const omFix = [punt(9, 45, 6, 11, 5, 3, 90), punt(11, 3, 7, 13, 20, 4, 90), punt(14, 1, 9, 15, 40, 9, 180)];
const kvFix = (waarsch: string) => `<h2>Vandaag &amp; morgen</h2><p class="intro">Mist, later zon</p><p><strong><a href="x">Waarschuwingen</a></strong>&nbsp;<br>${waarsch}<br><br><strong>Vanochtend</strong>&nbsp;komt er in vrijwel het hele land mist voor. In het noorden blijft het mistig, in het zuiden schijnt de zon. De maximumtemperatuur van 11&#176;C tot 14&#176;C. (Bron: KNMI)</p>`;
await t("weer: landelijk beeld uit meerdere stations, plaats Nederland, geen Haarlem", async () => {
  const { weer, knmiTekst } = buildWeer(brFix, null, kvFix("Er zijn geen waarschuwingen."), "2026-10-30", "10:00");
  assert.equal(weer.plaats, "Nederland");
  assert.deepEqual(weer.nu, { temp: 11, gevoel: 11, omschrijving: "Bewolkt", van: 8, tot: 14 }, "mediaan van landstations, platform en lege meting genegeerd");
  assert.deepEqual(weer.vandaag, { min: 7, max: 13, neerslagkans: 10, wind: "O 3 Bft" });
  assert.equal(weer.waarschuwing, "");
  assert.ok(weer.verwachting.includes("noorden") && knmiTekst.includes("zuiden"));
  assert.ok(weer.bronnen.some((b: any) => b.site === "KNMI" && b.href === KNMI_VERW));
  assert.ok(!JSON.stringify(weer).includes("Haarlem"));
});
await t("weer: landelijke KNMI-waarschuwing, ergste code wint", async () => {
  assert.equal(buildWeer(null, null, kvFix("Vanochtend plaatselijk dichte mist (code geel)."), "2026-10-30", "10:00").weer.waarschuwing, "Code geel: Vanochtend plaatselijk dichte mist.");
  const w = buildWeer(null, null, kvFix("Vanochtend mist (code geel).<br>Vanmiddag in het noorden storm (code oranje)."), "2026-10-30", "10:00").weer;
  assert.equal(w.waarschuwing, "Code oranje: Vanmiddag in het noorden storm.");
  assert.ok(w.bronnen.some((b: any) => b.site === "KNMI waarschuwingen"));
});
await t("weer: Open-Meteo met meerdere punten geeft noord–zuid-bereik en hoogste kans", async () => {
  assert.equal(new URL(OM_URL).searchParams.get("latitude")!.split(",").length, 3, "één verzoek, drie punten");
  const { weer } = buildWeer(null, omFix, null, "2026-10-30", "10:00");
  assert.deepEqual(weer.nu, { temp: 11, gevoel: 10, omschrijving: "Bewolkt", van: 9, tot: 14 });
  assert.deepEqual(weer.vandaag, { min: 6, max: 15, neerslagkans: 40, wind: "Z 5 Bft" });
  assert.equal(weer.dagen.length, 1);
  assert.equal(weer.waarschuwing, "");
});
await t("weer: ontbrekende bronnen leveren lege velden, geen verzonnen getallen", async () => {
  const { weer } = buildWeer(null, null, null, "2026-10-30", "10:00");
  assert.equal(weer.plaats, "Nederland");
  assert.equal(weer.nu, undefined);
  assert.equal(weer.vandaag, undefined);
  assert.deepEqual(weer.dagen, []);
  assert.equal(weer.verwachting, "");
});
await t("weer: simpelWeer-prompt is landelijk, invoer max 1500 tekens, één aanroep", async () => {
  const gezien: any[] = [];
  const ai: any = { run: async (_m: string, inv: any) => { gezien.push(inv); return { response: "Het wordt droog.", usage: { prompt_tokens: 10, completion_tokens: 5 } }; } };
  await simpelWeer(ai, "m", "x".repeat(5000), { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 });
  assert.equal(gezien.length, 1);
  const prompt = JSON.stringify(gezien[0]);
  assert.ok(!/Haarlem/i.test(prompt) && /heel Nederland/.test(prompt));
  assert.ok(JSON.stringify(gezien[0].messages.at(-1).content).length < 1900);
});

await t("artikelprompts vragen B1 en behouden één call per groep", async () => {
  const calls: any[] = [];
  const ai: any = { run: async (_model: string, args: any) => { calls.push(args); return { response: '{"items":[{"id":1,"kop":"Kop","ai":"Een zin."}]}' }; } };
  const usage = { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 };
  await summarize(ai, "model", [{ id: 1, cat: "nl", bronnen: ["Bron"], titels: ["Kop"], tekst: "Tekst" }, { id: 2, cat: "nl", bronnen: [], titels: [], tekst: "Tekst" }], usage);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].max_tokens, 440);
  await inHetKort(ai, "model", ["Bericht"], usage);
  await verdiep(ai, "model", [{ id: 1, kop: "Kop", kort: "Kort", bronnen: [] }], usage);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    const stijl = call.messages[0].content;
    assert.match(stijl, /volwassenen.*B1/);
    assert.match(stijl, /korte zinnen \(liefst hooguit 15 woorden, nooit meer dan 20\)/);
    assert.match(stijl, /jargon en moeilijke woorden kort uit/);
    assert.match(stijl, /afkortingen bij eerste gebruik voluit/i);
    assert.match(stijl, /ALLEEN feiten.*verzin niets/);
  }
});

console.log(`\n${n} Worker-tests geslaagd`);

await t("AI-ronde verdeelt sport binnen de limiet", async () => {
  const cats = ["nl", "tech", "haarlem", "showbizz", "voetbal", "f1", "auto"];
  const groepen = Object.fromEntries(cats.map((c) => [c, Array(20).fill(c)]));
  const picks = kiesVoorAI(groepen, 1, 40);
  assert.equal(picks.length, 40);
  for (const c of ["f1", "voetbal", "auto"]) assert.equal(picks.filter((x) => x === c).length, 1);
  const alleenNlSport = Object.fromEntries(["nl", "f1", "voetbal", "auto"].map((c) => [c, Array(40).fill(c)]));
  const beperkt = kiesVoorAI(alleenNlSport, 1, 40);
  assert.equal(beperkt.filter((x) => x === "nl").length, 37);
  assert.equal(beperkt.filter((x) => x !== "nl").length, 3);
  const tier3 = kiesVoorAI(Object.fromEntries(cats.map((c) => [c, Array(20).fill(c)])), 3, 40);
  assert.ok(tier3.every((c) => c === "nl" || c === "haarlem"));
  assert.deepEqual(kiesVoorAI({ f1: ["f1"], voetbal: ["voetbal"], auto: ["auto"] }, 1, 2), ["f1", "voetbal"]);
});

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
