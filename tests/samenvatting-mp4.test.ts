import assert from "node:assert/strict";
import { mp4Audio } from "../functions/samenvatting";

const origineel = globalThis.fetch;
try {
  for (const lengte of [undefined, "2", "ongeldig"]) {
    let geannuleerd = false, gelezen = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) { gelezen++; c.enqueue(new Uint8Array(4)); },
      cancel() { geannuleerd = true; },
    }, { highWaterMark: 0 });
    globalThis.fetch = (async (_url, init) => {
      assert.equal(new Headers(init?.headers).get("range"), "bytes=0-7");
      return new Response(stream, { headers: lengte ? { "content-length": lengte } : {} });
    }) as typeof fetch;
    const why: string[] = [];
    const resultaat = await mp4Audio("https://media.example/test.mp4", why, 8);
    assert.equal(resultaat?.sec, -1);
    assert.equal(resultaat?.bytes.length, 0);
    assert.equal(geannuleerd, true);
    assert.equal(gelezen, 3);
    assert.match(why[0], /te groot/);
  }
  globalThis.fetch = (async () => new Response("klein")) as typeof fetch;
  assert.equal(new TextDecoder().decode((await mp4Audio("https://media.example/test.mp4", [], 8))!.bytes), "klein");
  globalThis.fetch = (async () => new Response("moovmdat", { status: 206, headers: { "content-range": "bytes 0-7/20" } })) as typeof fetch;
  const bereik = await mp4Audio("https://media.example/test.mp4", [], 8);
  assert.equal(new TextDecoder().decode(bereik!.bytes), "moovmdat");
  assert.equal(bereik!.sec, 0);
} finally { globalThis.fetch = origineel; }
console.log("samenvatting MP4-limiet: geslaagd");
