import assert from "node:assert/strict";
import { xPosts, xFouten, XFout } from "../worker/src/x";
import { uurInhoud } from "../worker/src/opslag";

const origineel = globalThis.fetch;
try {
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response("", { status: urls.length === 1 ? 404 : 429 });
  };
  let fout: XFout | undefined;
  try { await xPosts("PowNed"); } catch (e) { if (e instanceof XFout) fout = e; else throw e; }
  assert.ok(fout);
  assert.deepEqual([fout.fx, fout.syn], ["fxtwitter HTTP 404", "syndication HTTP 429"]);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /fxtwitter/);
  assert.match(urls[1], /syndication/);
  const diagnose = xFouten([
    { url: "https://x.com/PowNed", ok: false, xFout: { fx: fout.fx, syn: fout.syn } },
    { url: "https://x.com/RTLnieuws", ok: true },
    { url: "https://x.com/telegraaf", ok: false, err: "netwerkfout" },
  ]);
  assert.deepEqual(diagnose, [
    { account: "PowNed", fx: "fxtwitter HTTP 404", syn: "syndication HTTP 429" },
    { account: "telegraaf", fx: "netwerkfout", syn: "onbekend" },
  ]);
  assert.equal(uurInhoud({ items: [], meta: { xFouten: diagnose } }), uurInhoud({ items: [], meta: { xFouten: [] } }));
  urls.length = 0;
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ code: 200, results: [] }), { status: 200 });
  };
  assert.equal((await xPosts("RTLnieuws")).via, "fxtwitter");
  assert.equal(urls.length, 1);
  console.log("✓ X-fouten, ophaalvolgorde en inhoudshash");
} finally {
  globalThis.fetch = origineel;
}
