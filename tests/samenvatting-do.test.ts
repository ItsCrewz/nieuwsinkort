import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { onRequestPost as svPost } from "../functions/samenvatting";
import { videoSlug } from "../src/slug";
import { budget } from "./budget-do";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
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

console.log(`\n${n} samenvatting-DO-tests geslaagd`);
