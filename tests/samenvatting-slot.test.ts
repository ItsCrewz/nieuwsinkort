// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { onRequestPost as svPost } from "../functions/samenvatting";
import { videoSlug } from "../src/slug";

let n = 0;

// ---- /samenvatting: slot, cache van fouten, headers, geen `why` (mock-KV en mock-AI)
const svOmgeving = () => {
  const m = new Map<string, string>(), schrijf: string[] = [];
  const video = { titel: "Testfilmpje", href: "https://x.com/a/status/1", embed: "https://video.twimg.com/a.mp4", bron: "X" };
  m.set("uur", JSON.stringify({ filmpjes: [video], dumpert: [] }));
  const calls: string[] = [];
  const env: any = {
    NIEUWS: {
      get: async (k: string, ty?: string) => { await 0; const v = m.get(k); return v == null ? null : ty === "json" ? JSON.parse(v) : v; },
      put: async (k: string, v: string) => { await 0; schrijf.push(k); m.set(k, v); },
      delete: async (k: string) => { m.delete(k); },
    },
    ASSETS: { fetch: async () => new Response("{}") },
    AI: { run: async (model: string) => { calls.push(model); await new Promise((r) => setTimeout(r, 5)); return model.includes("whisper") ? { text: "dit is een lange gesproken tekst over het nieuws van vandaag", transcription_info: { duration: 60 } } : { response: "", usage: { prompt_tokens: 10, completion_tokens: 1 } }; } },
  };
  const post = (o: any = {}, h: Record<string, string> = { "Content-Type": "application/json" }) =>
    svPost({ request: new Request("https://nieuwsinkort.test/samenvatting", { method: "POST", headers: h, body: JSON.stringify({ id: videoSlug(video as any), ...o }) }), env });
  return { env, m, schrijf, calls, post };
};
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(new Uint8Array(2e6), { status: 200 })) as any;
  try {
    const a = svOmgeving();
    const rs = await Promise.all(Array.from({ length: 20 }, () => a.post()));
    assert.equal(a.calls.filter((c) => c.includes("whisper")).length, 1, "20 gelijktijdige POST's: hooguit 1 Whisper-aanroep");
    const js: any[] = await Promise.all(rs.map((r) => r.json()));
    assert.ok(js.every((j) => !("why" in j)), "geen why naar de client");
    assert.ok(js.filter((j) => j.code === "bezig").length >= 19);
    const n = a.calls.length;
    const tweede: any = await (await a.post()).json();
    assert.equal(tweede.cached, true);
    assert.equal(tweede.code, "fout");
    assert.equal(a.calls.length, n, "fout-uitkomst gecachet: geen nieuwe AI-aanroep");
    assert.ok(a.m.has("vs-uur:" + Object.keys(Object.fromEntries(a.m)).find((k) => k.startsWith("vs-uur:"))?.slice(7)), "uurteller gezet");
    assert.ok(+a.m.get(Object.keys(Object.fromEntries(a.m)).find((k) => k.startsWith("vid-neurons:"))!)! > 0, "neuronen verrekend");

    const b = svOmgeving();
    const pre: any = await (await b.post({ pre: true })).json();
    assert.ok(Array.isArray(pre.why), "pre:true krijgt why wel");

    // uurrem: bij een volle teller geen AI
    const c = svOmgeving();
    const d = new Date(); const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
    c.m.set(`vs-uur:${p.year}-${p.month}-${p.day}T${+p.hour}`, "30");
    const vol: any = await (await c.post()).json();
    assert.equal(vol.code, "druk");
    assert.equal(c.calls.length, 0);
  } finally { globalThis.fetch = realFetch; }

  for (const [h, status] of [[{ "Content-Type": "text/plain" }, 415], [{}, 415], [{ "Content-Type": "application/json", Origin: "https://evil.example" }, 403]] as const) {
    const e = svOmgeving();
    const r = await e.post({}, h as any);
    assert.equal(r.status, status);
    assert.equal(e.schrijf.length, 0, "geen KV-schrijf");
    assert.equal(e.calls.length, 0, "geen AI-aanroep");
  }
  const ok = svOmgeving();
  assert.notEqual((await ok.post({}, { "Content-Type": "application/json", Origin: "https://nieuwsinkort.test" })).status, 403);
  n++; console.log("✓ samenvatting: slot, foutcache, 415/403, uurrem, geen why");
}

console.log(`\n${n} tests geslaagd`);
