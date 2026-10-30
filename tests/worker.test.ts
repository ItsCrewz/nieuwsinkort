import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker, { Runner } from "../worker/src/index";
import { Budget } from "../worker/src/budget";
import { onRequestPost as svPost } from "../functions/samenvatting";
import { videoSlug } from "../src/slug";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
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

console.log(`\n${n} Worker-tests geslaagd`);
