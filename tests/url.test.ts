import assert from "node:assert/strict";
import { externeFetch, externeUrl } from "../worker/src/url";

assert.equal(externeUrl("https://voorbeeld.nl:443/a"), "https://voorbeeld.nl/a");
for (const url of ["", "/relatief", "javascript:alert(1)", "http://localhost./", "https://sub.local/", "http://dienst.internal/", "http://127.0.0.1/", "http://[::1]/", "https://voorbeeld.nl:8080/"]) assert.equal(externeUrl(url), null, url);
const origineel = globalThis.fetch;
try {
  let aangeroepen = false;
  globalThis.fetch = (async (_url, init) => { aangeroepen = true; assert.equal(init?.redirect, "follow"); return new Response("ok"); }) as typeof fetch;
  assert.equal(await (await externeFetch("https://voorbeeld.nl", {})).text(), "ok");
  await assert.rejects(externeFetch("http://localhost", {}), /geweigerde externe URL/);
  assert.equal(aangeroepen, true);
  let geannuleerd = false;
  globalThis.fetch = (async () => ({ url: "http://127.0.0.1/", body: { cancel: async () => { geannuleerd = true; } } })) as unknown as typeof fetch;
  await assert.rejects(externeFetch("https://voorbeeld.nl", {}), /geweigerde redirect-URL/);
  assert.equal(geannuleerd, true);
} finally { globalThis.fetch = origineel; }
console.log("✓ url: externe adressen en redirects");
