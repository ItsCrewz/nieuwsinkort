import assert from "node:assert/strict";
import { onRequestPost } from "../functions/samenvatting";

const origineel = globalThis.fetch;
try {
  for (const scenario of ["hls", "fmp4", "groot", "http"] as const) {
    const data = new Map<string, string>();
    const embed = scenario === "hls" || scenario === "fmp4" ? "https://media.example/test.m3u8" : "https://media.example/test.mp4";
    data.set("uur", JSON.stringify({ dumpert: [{ href: "https://www.dumpert.nl/item/test", embed, titel: "Test", bron: "Test" }] }));
    let ai = 0;
    const env: any = { NIEUWS: {
      get: async (k: string, type: string) => type === "json" ? JSON.parse(data.get(k) || "null") : data.get(k) || null,
      put: async (k: string, v: string) => { data.set(k, v); }, delete: async (k: string) => { data.delete(k); },
    }, ASSETS: { fetch: async () => Response.json({}) }, AI: { run: async (model: string) => {
      ai++;
      return model.includes("whisper") ? { text: "Dit is een lange gesproken tekst over het nieuws van vandaag en andere belangrijke gebeurtenissen.", transcription_info: { duration: 20 } } : { response: "- Eerste belangrijk punt\n- Tweede belangrijk punt" };
    } } };
    globalThis.fetch = (async (url: any) => {
      const u = String(url);
      if (scenario === "http") return new Response("", { status: 403 });
      if (scenario === "groot") return new Response("mdat", { headers: { "content-range": "bytes 0-3/13000000" } });
      if (scenario === "fmp4") return new Response("#EXTM3U\n#EXT-X-MAP:URI=init.mp4\n");
      if (u.endsWith("test.m3u8")) return new Response("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlaag.m3u8\n");
      if (u.endsWith("laag.m3u8")) return new Response("#EXTM3U\n#EXTINF:10,\nsegment.ts\n");
      return new Response(new Uint8Array([1, 2, 3]));
    }) as typeof fetch;
    const request = new Request("https://nieuwsinkort.nl/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "d-test", pre: true }) });
    const result: any = await (await onRequestPost({ request, env })).json();
    if (scenario === "hls") { assert.equal(result.ok, true); assert.equal(ai, 2); assert.equal(result.sec, 20); }
    else {
      assert.equal(result.code, scenario === "groot" ? "te-lang" : "geen-tekst");
      assert.equal(ai, 0);
      assert.ok(result.why.length);
    }
  }
} finally { globalThis.fetch = origineel; }
console.log("samenvatting media: geslaagd");
