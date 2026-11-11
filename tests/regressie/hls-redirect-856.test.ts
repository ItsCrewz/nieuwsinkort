import assert from "node:assert/strict";
import { onRequestPost } from "../../functions/samenvatting";

const origineel = globalThis.fetch;
try {
  for (const scenario of ["master", "media", "zonder"] as const) {
    const begin = "https://media.example/oorspronkelijk/master.m3u8";
    const master = scenario === "master" ? "https://media.example/nieuw/master.m3u8" : begin;
    const media = new URL("laag/index.m3u8", master).href;
    const eind = scenario === "media" ? "https://media.example/anders/index.m3u8" : media;
    const segment = new URL("stuk.ts", eind).href;
    const verzoeken: string[] = [];
    const data = new Map<string, string>([["uur", JSON.stringify({ dumpert: [{ href: "https://www.dumpert.nl/item/test", embed: begin, titel: "Test", bron: "Test" }] })]]);
    const env: any = { NIEUWS: {
      get: async (k: string, type: string) => type === "json" ? JSON.parse(data.get(k) || "null") : data.get(k) || null,
      put: async (k: string, v: string) => { data.set(k, v); }, delete: async (k: string) => { data.delete(k); },
    }, ASSETS: { fetch: async () => Response.json({}) }, AI: { run: async (model: string) => model.includes("whisper")
      ? { text: "Dit is een lange gesproken tekst over het nieuws van vandaag en andere belangrijke gebeurtenissen.", transcription_info: { duration: 10 } }
      : { response: "- Eerste belangrijk punt\n- Tweede belangrijk punt" } } };
    globalThis.fetch = (async (url: any) => {
      const u = String(url);
      verzoeken.push(u);
      const inhoud = u === begin ? "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlaag/index.m3u8\n"
        : u === media ? "#EXTM3U\n#EXTINF:10,\nstuk.ts\n" : u === segment ? "audio" : null;
      assert.notEqual(inhoud, null, `onverwacht verzoek: ${u}`);
      const response = new Response(inhoud);
      Object.defineProperty(response, "url", { value: u === begin ? master : u === media ? eind : u });
      return response;
    }) as typeof fetch;
    const request = new Request("https://nieuwsinkort.nl/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "d-test" }) });
    const result: any = await (await onRequestPost({ request, env })).json();
    assert.equal(result.ok, true, scenario);
    assert.deepEqual(verzoeken, [begin, media, segment], scenario);
  }
} finally { globalThis.fetch = origineel; }
console.log("HLS-playlistredirects: geslaagd");
