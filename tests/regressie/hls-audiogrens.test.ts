import assert from "node:assert/strict";
import { onRequestPost } from "../../functions/samenvatting";

const origineel = globalThis.fetch;
async function scenario(lengte: string | null, grootte: number, fout = false) {
  const opslag = new Map<string, string>();
  opslag.set("uur", JSON.stringify({ filmpjes: [{ href: "https://www.dumpert.nl/item/test", embed: "https://media.example/test.m3u8", titel: "Test", bron: "Test" }] }));
  let ai = 0, segmenten = 0, geannuleerd = false;
  const env: any = { NIEUWS: {
    get: async (k: string, type: string) => type === "json" ? JSON.parse(opslag.get(k) || "null") : opslag.get(k) || null,
    put: async (k: string, v: string) => { opslag.set(k, v); }, delete: async (k: string) => { opslag.delete(k); },
  }, ASSETS: { fetch: async () => Response.json({}) }, AI: { run: async (model: string) => {
    ai++;
    return model.includes("whisper") ? { text: "Dit is een voldoende lange transcriptie over het nieuws van vandaag en meer informatie.", transcription_info: { duration: 20 } } : { response: "- Eerste punt van het nieuws\n- Tweede punt van het nieuws" };
  } } };
  globalThis.fetch = (async (url: any) => {
    if (String(url).endsWith(".m3u8")) return new Response("#EXTM3U\n#EXTINF:10,\n1.ts\n#EXTINF:10,\n2.ts");
    segmenten++;
    if (fout) return new Response("", { status: 500 });
    const headers = lengte === null ? {} : { "Content-Length": lengte };
    return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(grootte)); }, cancel() { geannuleerd = true; } }), { headers });
  }) as typeof fetch;
  // Een afgesloten stream is nodig voor de normale playlist.
  if (grootte < 1000) globalThis.fetch = (async (url: any) => String(url).endsWith(".m3u8") ? new Response("#EXTM3U\n#EXTINF:10,\n1.ts\n#EXTINF:10,\n2.ts") : (segmenten++, new Response(new Uint8Array(grootte)))) as typeof fetch;
  const request = new Request("https://nieuwsinkort.nl/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "d-test" }) });
  const response = await onRequestPost({ request, env });
  return { response, body: await response.json() as any, ai, segmenten, geannuleerd };
}
try {
  const normaal = await scenario(null, 100);
  assert.equal(normaal.body.ok, true);
  assert.equal(normaal.segmenten, 2);
  assert.equal(normaal.ai, 2);
  for (const lengte of ["12000001", null, "1", "onjuist"]) {
    const groot = await scenario(lengte, 12_000_001);
    assert.equal(groot.response.status, 503);
    assert.equal(groot.body.code, "fout");
    assert.equal(groot.ai, 0);
    assert.equal(groot.segmenten, 1);
    assert.equal(groot.geannuleerd, true);
  }
  const fout = await scenario(null, 1000, true);
  assert.equal(fout.response.status, 503);
  assert.equal(fout.ai, 0);
  assert.equal(fout.segmenten, 1);
} finally { globalThis.fetch = origineel; }
console.log("HLS-audiogrens: geslaagd");
