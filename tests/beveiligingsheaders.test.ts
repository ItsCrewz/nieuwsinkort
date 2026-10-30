// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { onRequestGet as dataGet } from "../functions/data.json";
import { onRequestGet as meerGet } from "../functions/meer";
import { onRequestGet as samGet, onRequestPost as samPost } from "../functions/samenvatting";
import { onRequest as dumpert } from "../functions/media/dumpert/[[path]]";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const resultaat = fn();
  if (resultaat instanceof Promise) return resultaat.then(klaar);
  klaar();
};

t("CSP staat alleen het exacte thema-script en de benodigde mediabronnen toe", () => {
  const html = readFileSync("index.html", "utf8");
  const headers = readFileSync("public/_headers", "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
  const hash = createHash("sha256").update(script).digest("base64");
  const csp = /Content-Security-Policy: (.+)/.exec(headers)![1];
  const regels = new Map(csp.split("; ").map((r) => { const [k, ...v] = r.split(" "); return [k, v.join(" ")]; }));
  assert.equal(regels.get("script-src"), "'self' 'sha256-" + hash + "'");
  for (const [k, v] of Object.entries({
    "default-src": "'self'", "style-src": "'self' 'unsafe-inline'",
    "font-src": "'self'", "img-src": "'self' https: data:",
    "media-src": "'self' https: blob:", "connect-src": "'self' https:",
    "frame-src": "https://www.youtube-nocookie.com", "worker-src": "'self' blob:",
    "object-src": "'none'", "base-uri": "'self'", "form-action": "'none'", "frame-ancestors": "'none'",
  })) assert.equal(regels.get(k), v, k);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)/);
  assert.ok(!headers.includes("/data.json"));
});

const req = (pad: string) => new Request("https://voorbeeld.test" + pad);
const assets = { fetch: async () => Response.json({ items: [], filmpjes: [], dumpert: [] }) };
const kv = { get: async () => null, put: async () => {} } as any;
const antwoorden = [
  await dataGet({ request: req("/data.json"), env: { ASSETS: assets } }),
  await dataGet({ request: req("/data.json"), env: { ASSETS: assets, NIEUWS: kv } }),
  await dataGet({ request: req("/data.json?statisch=1"), env: { ASSETS: assets, NIEUWS: kv } }),
  await dataGet({ request: req("/data.json"), env: { ASSETS: { fetch: async () => new Response("{}", { status: 404 }) } } }),
  await meerGet({ request: req("/meer"), env: {} }),
  await meerGet({ request: req("/meer?k=test"), env: { NIEUWS: kv } }),
  await meerGet({ request: req("/meer?k=test"), env: { NIEUWS: { get: async () => ({ items: { test: { uitleg: ["tekst"] } } }) } } }),
  await samGet({ request: req("/samenvatting"), env: { NIEUWS: kv, ASSETS: assets, AI: {} } }),
  await samPost({ request: new Request("https://voorbeeld.test/samenvatting", { method: "POST", body: "{}" }), env: { NIEUWS: kv, ASSETS: assets, AI: {} } }),
  await dumpert({ request: req("/media/dumpert/ongeldig"), params: { path: "ongeldig" } }),
  await dumpert({ request: new Request("https://voorbeeld.test/media/dumpert/x", { method: "POST" }), params: {} }),
];
const origineelFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response("media", { headers: { "Content-Type": "video/mp2t" } });
  antwoorden.push(await dumpert({ request: req("/media/dumpert/x"), params: { path: "dmp/media/video/abc/123.ts" } }));
  globalThis.fetch = async () => new Response("fout", { status: 502 });
  antwoorden.push(await dumpert({ request: req("/media/dumpert/x"), params: { path: "dmp/media/video/abc/123.ts" } }));
} finally { globalThis.fetch = origineelFetch; }
t("alle vier Functions zetten nosniff bij succes, terugval en fouten zonder netwerk of AI", () => {
  assert.deepEqual(antwoorden.map((r) => r.status), [200, 200, 200, 404, 400, 404, 200, 400, 415, 404, 405, 200, 502]);
  for (const r of antwoorden) assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
});

console.log(`\n${n} tests geslaagd`);
