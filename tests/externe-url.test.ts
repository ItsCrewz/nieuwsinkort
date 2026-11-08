// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { externeUrl, externeFetch } from "../worker/src/url";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const resultaat = fn();
  if (resultaat instanceof Promise) return resultaat.then(klaar);
  klaar();
};

t("externe URL: schema, poort en host controleren", () => {
  for (const h of ["http://127.0.0.1/", "http://localhost:8787/", "https://x.nl:8443/", "javascript:x", "/relatief", "http://[::1]/", "http://2130706433/", "http://0x7f000001/", "https://host.local/", "https://host.internal/", "http://localhost./", "http://sub.localhost/"]) assert.equal(externeUrl(h), null, h);
  for (const h of ["https://nos.nl/artikel/1", "http://nos.nl:80/", "https://nos.nl:443/"]) assert.equal(externeUrl(h), new URL(h).toString(), h);
});

// Geen netwerk: controleer dat ongeldige invoer niet wordt opgehaald en redirects worden verworpen.
{
  const origineel = globalThis.fetch;
  let calls = 0, geannuleerd = false;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      assert.equal(init?.redirect, "follow");
      const r = new Response(new ReadableStream({ cancel() { geannuleerd = true; } }));
      Object.defineProperty(r, "url", { value: "http://127.0.0.1/" });
      return r;
    };
    await assert.rejects(externeFetch("http://localhost/", {}), /geweigerde externe URL/);
    t("geweigerde URL doet geen fetch", () => assert.equal(calls, 0));
    await assert.rejects(externeFetch("https://nos.nl/artikel/1", {}), /geweigerde redirect-URL/);
    t("geweigerde redirect levert geen resultaat op en sluit de body", () => {
      assert.equal(calls, 1);
      assert.equal(geannuleerd, true);
    });
    globalThis.fetch = async () => {
      const r = new Response("artikel");
      Object.defineProperty(r, "url", { value: "https://nos.nl/artikel/2" });
      return r;
    };
    const r = await externeFetch("https://nos.nl/artikel/1", {});
    const tekst = await r.text();
    t("toegestane redirect behoudt het resultaat", () => assert.equal(tekst, "artikel"));
  } finally { globalThis.fetch = origineel; }
}

console.log(`\n${n} tests geslaagd`);
