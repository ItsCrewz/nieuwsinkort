// Draai: npm test  (artikelbeeldproxy functions/media/beeld/[[path]].ts en src/beeldhost.ts, zonder netwerk)
import assert from "node:assert/strict";
import { onRequest } from "../functions/media/beeld/[[path]]";
import { upstreamUrl } from "../functions/media/beeld/[[path]]";
import { beeldViaProxy, beeldHostToegestaan } from "../src/beeldhost";

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", name); };

type Call = { url: string; init: any };
let calls: Call[] = [];
const mock = (...antwoorden: (() => Response)[]) => {
  calls = [];
  let i = 0;
  globalThis.fetch = (async (url: any, init: any) => { calls.push({ url: String(url), init }); return antwoorden[Math.min(i++, antwoorden.length - 1)](); }) as any;
};
const jpg = (extra: Record<string, string> = {}) => () => new Response("jpgbytes", { headers: { "content-type": "image/jpeg", ...extra } });
const vraag = (rest: string, method = "GET", headers: Record<string, string> = {}) =>
  onRequest({ request: new Request(`https://nieuwsinkort.nl/media/beeld/${rest}`, { method, headers }) });

await t("allowlist-hosts: jpg en webp, query blijft behouden, alleen https upstream", async () => {
  mock(jpg());
  const r = await vraag("redactie.rtl.nl/sites/default/files/a%20b.jpg?itok=XZ&width=1024&height=576");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "jpgbytes");
  assert.equal(calls[0].url, "https://redactie.rtl.nl/sites/default/files/a%20b.jpg?itok=XZ&width=1024&height=576");
  assert.equal(calls[0].init.redirect, "manual");
  mock(() => new Response("w", { headers: { "content-type": "image/webp" } }));
  const w = await vraag("webp.br.cdn.pxr.nl/x/y.webp?width=1200");
  assert.equal(w.status, 200);
  assert.equal(w.headers.get("content-type"), "image/webp");
  assert.equal(calls[0].url, "https://webp.br.cdn.pxr.nl/x/y.webp?width=1200");
  assert.equal((await vraag("cdn-7.motorsport.com/images/a.jpg")).status, 200);
});

await t("antwoordheaders: nosniff, CSP, cache, geen Set-Cookie/CORS, alleen whitelist", async () => {
  mock(jpg({ "set-cookie": "__cf_bm=abc; Domain=telegraaf.nl", etag: "\"e\"", "last-modified": "Mon, 01 Jan 2024 00:00:00 GMT", "access-control-allow-origin": "*", "x-geheim": "1", "content-length": "8" }));
  const r = await vraag("prod-img.telegraaf.nl/public/a.jpg");
  assert.equal(r.headers.get("set-cookie"), null);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  assert.equal(r.headers.get("x-geheim"), null);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match(r.headers.get("content-security-policy") || "", /default-src 'none'; sandbox/);
  assert.equal(r.headers.get("cache-control"), "public, max-age=86400");
  assert.equal(r.headers.get("etag"), "\"e\"");
  assert.equal(r.headers.get("content-length"), "8");
  assert.deepEqual(calls[0].init.cf.cacheTtlByStatus["500-599"], 0);
});

await t("verzoek van de bezoeker: geen cookies/Authorization/Referer door", async () => {
  mock(jpg());
  await vraag("images.nu.nl/a.jpg", "GET", { Cookie: "sessie=1", Authorization: "Bearer x", Referer: "https://nieuwsinkort.nl/" });
  const h = new Headers(calls[0].init.headers);
  for (const k of ["cookie", "authorization", "referer", "origin"]) assert.equal(h.get(k), null, k);
});

await t("andere methodes: 405 zonder fetch; HEAD mag", async () => {
  mock(jpg());
  for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
    const r = await vraag("images.nu.nl/a.jpg", m);
    assert.equal(r.status, 405, m);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal(calls.length, 0);
  const h = await vraag("images.nu.nl/a.jpg", "HEAD");
  assert.equal(h.status, 200);
  assert.equal(await h.text(), "");
});

await t("geweigerd zonder fetch: vreemde/lookalike hosts, IP, poort, userinfo, padtrucs", async () => {
  mock(jpg());
  const fout = [
    "evil.example/a.jpg", "prod-img.telegraaf.nl.evil.com/a.jpg", "eviltelegraaf.nl/a.jpg", "xprod-img.telegraaf.nl/a.jpg",
    "telegraaf.nl/a.jpg", "127.0.0.1/a.jpg", "169.254.169.254/latest", "[::1]/a.jpg", "localhost/a.jpg",
    "images.nu.nl:8080/a.jpg", "images.nu.nl:443/a.jpg", "user@images.nu.nl/a.jpg", "user:pw@images.nu.nl/a.jpg", "images.nu.nl@evil.com/a.jpg",
    "webp.br.cdn.pxr.nl.evil.com/a.jpg", "webp.bra.cdn.pxr.nl/a.jpg", "webp.b1.cdn.pxr.nl/a.jpg", "xwebp.br.cdn.pxr.nl/a.jpg",
    "cdn-x.motorsport.com/a.jpg", "cdn-1.motorsport.com.evil.com/a.jpg", "cdn-1.motorsport.comx/a.jpg", "cdn-1.motorsport.com%2eevil.com/a.jpg",
    "images.nu.nl/%2e%2e/geheim.jpg", "images.nu.nl/a%2fb.jpg", "images.nu.nl/a%2Fb.jpg", "images.nu.nl/a%5cb.jpg", "images.nu.nl/a%00.jpg",
    "images.nu.nl/a%252fb.jpg", "images.nu.nl//a.jpg", "images.nu.nl/a//b.jpg",
    "images.nu.nl", "images.nu.nl/", "", "https:/evil.com/a.jpg", "https://evil.com/a.jpg",
  ];
  for (const p of fout) {
    const r = await vraag(p);
    assert.equal(r.status, 404, p);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal(calls.length, 0);
});

await t("upstreamUrl: backslash, control chars en query-trucs direct geweigerd", () => {
  for (const p of ["images.nu.nl/a\\b.jpg", "images.nu.nl/a\u0001.jpg", "images.nu.nl/./a.jpg", "images.nu.nl/../a.jpg", "images.nu.nl/a\x7f.jpg"]) assert.equal(upstreamUrl(p, ""), null, p);
  assert.equal(upstreamUrl("images.nu.nl/a.jpg", "?x=\\evil"), null);
  assert.equal(upstreamUrl("images.nu.nl/a.jpg", "?x=\n"), null);
  assert.equal(upstreamUrl("images.nu.nl/a%20b.jpg", "?w=1")?.href, "https://images.nu.nl/a%20b.jpg?w=1");
});

await t("padtrucs met ruwe request-URL (.. wordt door URL genormaliseerd, nooit buiten de allowlist)", async () => {
  mock(jpg());
  const r = await onRequest({ request: new Request("https://nieuwsinkort.nl/media/beeld/images.nu.nl/../evil.com/a.jpg") });
  assert.equal(r.status, 404); // pad wordt /media/evil.com/a.jpg: geen prefix
  assert.equal(calls.length, 0);
});

await t("redirect naar host buiten de allowlist: 502; binnen de allowlist wordt gevolgd en opnieuw gecontroleerd", async () => {
  mock(() => new Response(null, { status: 302, headers: { location: "https://evil.example/a.jpg" } }));
  assert.equal((await vraag("images.nu.nl/a.jpg")).status, 502);
  assert.equal(calls.length, 1);
  for (const loc of ["http://images.nu.nl/a.jpg", "https://images.nu.nl:8443/a.jpg", "https://u@images.nu.nl/a.jpg", "https://127.0.0.1/a.jpg"]) {
    mock(() => new Response(null, { status: 301, headers: { location: loc } }));
    assert.equal((await vraag("images.nu.nl/a.jpg")).status, 502, loc);
    assert.equal(calls.length, 1, loc);
  }
  mock(() => new Response(null, { status: 301, headers: { location: "https://images.cdn.nos.nl/b.jpg" } }), jpg());
  const ok = await vraag("images.nu.nl/a.jpg");
  assert.equal(ok.status, 200);
  assert.deepEqual(calls.map((c) => c.url), ["https://images.nu.nl/a.jpg", "https://images.cdn.nos.nl/b.jpg"]);
  mock(() => new Response(null, { status: 301, headers: { location: "/zelfde.jpg" } }));
  assert.equal((await vraag("images.nu.nl/a.jpg")).status, 502); // redirectlus is begrensd
  assert.ok(calls.length <= 5);
});

await t("alleen jpeg/png/webp/gif/avif; html, svg en onbekend krijgen 415", async () => {
  for (const ty of ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/jpeg; charset=binary"]) {
    mock(() => new Response("x", { headers: { "content-type": ty } }));
    assert.equal((await vraag("images.nu.nl/a")).status, 200, ty);
  }
  for (const ty of ["text/html", "text/html; charset=utf-8", "image/svg+xml", "application/octet-stream", "image/jpegx", "application/json", ""]) {
    mock(() => new Response("<script>", { headers: ty ? { "content-type": ty } : {} }));
    const r = await vraag("images.nu.nl/a");
    assert.equal(r.status, 415, ty);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  }
});

await t("te groot: content-length boven grens 413; zonder/liegende lengte wordt de stream afgebroken", async () => {
  mock(jpg({ "content-length": String(5 * 1024 * 1024 + 1) }));
  assert.equal((await vraag("images.nu.nl/a.jpg")).status, 413);
  mock(jpg({ "content-length": "abc" }));
  assert.equal((await vraag("images.nu.nl/a.jpg")).status, 413);
  const groot = () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); } }), { headers: { "content-type": "image/jpeg" } });
  mock(groot);
  const r = await vraag("images.nu.nl/a.jpg");
  assert.equal(r.status, 200);
  await assert.rejects(r.arrayBuffer());
  mock(() => new Response(new Uint8Array(1024 * 1024), { headers: { "content-type": "image/jpeg" } }));
  assert.equal((await (await vraag("images.nu.nl/a.jpg")).arrayBuffer()).byteLength, 1024 * 1024);
});

await t("upstream 404 en 5xx worden niet doorgegeven als beeld, korte/geen cache, netwerkfout 502", async () => {
  mock(() => new Response("nee", { status: 404, headers: { "content-type": "image/jpeg", "set-cookie": "a=b" } }));
  const a = await vraag("images.nu.nl/a.jpg");
  assert.equal(a.status, 404);
  assert.equal(a.headers.get("set-cookie"), null);
  assert.notEqual(a.headers.get("cache-control"), "public, max-age=86400");
  mock(() => new Response("kapot", { status: 503 }));
  const b = await vraag("images.nu.nl/a.jpg");
  assert.equal(b.status, 502);
  assert.equal(b.headers.get("cache-control"), "no-store");
  globalThis.fetch = (async () => { throw new Error("net"); }) as any;
  assert.equal((await vraag("images.nu.nl/a.jpg")).status, 502);
});

await t("client: allowlist → /media/beeld/…, rest ongewijzigd", () => {
  assert.equal(beeldViaProxy("https://prod-img.telegraaf.nl/public/a%20b.jpg"), "/media/beeld/prod-img.telegraaf.nl/public/a%20b.jpg");
  assert.equal(beeldViaProxy("https://redactie.rtl.nl/x.jpg?itok=a&width=1024"), "/media/beeld/redactie.rtl.nl/x.jpg?itok=a&width=1024");
  assert.equal(beeldViaProxy("https://webp.vi.cdn.pxr.nl/a.webp?width=1200"), "/media/beeld/webp.vi.cdn.pxr.nl/a.webp?width=1200");
  for (const u of [
    "http://images.nu.nl/a.jpg", "https://evil.example/a.jpg", "https://prod-img.telegraaf.nl.evil.com/a.jpg", "https://images.nu.nl:8080/a.jpg",
    "https://u@images.nu.nl/a.jpg", "https://127.0.0.1/a.jpg", "data:image/png;base64,AAAA", "/relatief/a.jpg", "a.jpg", "", "//images.nu.nl/a.jpg",
    "https://i.ytimg.com/vi/x/hqdefault.jpg", "https://media.dumpert.nl/dmp/media/video/ab/p.jpg",
  ]) assert.equal(beeldViaProxy(u), u, u);
});

await t("client en server delen dezelfde allowlist (één module)", () => {
  assert.ok(beeldHostToegestaan("images.ad.nl") && beeldHostToegestaan("cdn-12.motorsport.com"));
  assert.ok(!beeldHostToegestaan("images.nu.nl.") && !beeldHostToegestaan("IMAGES.NU.NL"));
});

console.log(`\n${n} tests ok`);
