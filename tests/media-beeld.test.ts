// Draai: npm test  (artikelbeeldproxy functions/media/beeld/[[path]].ts en src/beeldhost.ts, zonder netwerk)
import assert from "node:assert/strict";
import { onRequest, acceptEmmer, cacheSleutel } from "../functions/media/beeld/[[path]]";
import { upstreamUrl } from "../functions/media/beeld/[[path]]";
import { beeldViaProxy, beeldHostToegestaan, beeldProxyPad } from "../src/beeldhost";

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
  assert.equal(r.headers.get("vary"), "Accept");
  // randcache van de upstream-fetch uit: geen opslag op URL-basis (zou emmers mengen)
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.cf.cacheTtl, -1);
  assert.equal(calls[0].init.cf.cacheEverything, false);
  assert.equal(calls[0].init.cf.cacheKey, undefined);
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

// Nep-Cache API (Node heeft geen caches.default): sleutel = URL van het Request.
const nepCache = () => {
  const m = new Map<string, Response>();
  const c = { m, async match(k: Request) { const r = m.get(k.url); return r ? r.clone() : undefined; }, async put(k: Request, r: Response) { m.set(k.url, new Response(await r.arrayBuffer(), { status: r.status, headers: r.headers })); } };
  (globalThis as any).caches = { default: c };
  return c;
};
const zonderCache = () => { delete (globalThis as any).caches; };
const AVIF = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
const WEBP = "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
const BASIS = "image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5";

await t("Accept-emmers: avif > webp > basis, en de upstream-Accept volgt de emmer", async () => {
  assert.equal(acceptEmmer(AVIF), "avif");
  assert.equal(acceptEmmer("image/webp,image/avif"), "avif");
  assert.equal(acceptEmmer(WEBP), "webp");
  assert.equal(acceptEmmer(BASIS), "basis");
  assert.equal(acceptEmmer("*/*"), "basis");
  assert.equal(acceptEmmer(null), "basis");
  assert.equal(acceptEmmer("IMAGE/AVIF"), "avif");
  const verwacht: Record<string, string> = { [AVIF]: "image/avif,image/webp,image/*;q=0.8", [WEBP]: "image/webp,image/*;q=0.8", [BASIS]: "image/png,image/jpeg,image/gif,image/*;q=0.8" };
  for (const [acc, up] of Object.entries(verwacht)) {
    mock(jpg());
    await vraag("images.nu.nl/a.jpg", "GET", { Accept: acc });
    assert.equal(new Headers(calls[0].init.headers).get("accept"), up);
  }
  mock(jpg());
  await vraag("images.nu.nl/a.jpg"); // zonder Accept
  assert.equal(new Headers(calls[0].init.headers).get("accept"), "image/png,image/jpeg,image/gif,image/*;q=0.8");
});

await t("cachesleutel verschilt per emmer en bevat host, pad en query", () => {
  const u = new URL("https://images.nu.nl/m/a%20b.jpg?w=1");
  const k = (["avif", "webp", "basis"] as const).map((e) => cacheSleutel(e, u));
  assert.equal(new Set(k).size, 3);
  assert.equal(k[0], "https://nieuwsinkort.nl/__beeldcache/avif/images.nu.nl/m/a%20b.jpg?w=1");
  assert.notEqual(cacheSleutel("avif", u), cacheSleutel("avif", new URL("https://images.nu.nl/m/a%20b.jpg?w=2")));
});

await t("Cache API: per emmer apart opgeslagen, hit geeft dezelfde headers zonder Set-Cookie en zonder tweede fetch", async () => {
  const c = nepCache();
  try {
    const bron = (tekst: string) => () => new Response(tekst, { headers: { "content-type": "image/jpeg", "set-cookie": "__cf_bm=x", etag: "\"e\"", "content-length": String(tekst.length) } });
    const wacht: Promise<unknown>[] = [];
    const ctx = (accept: string, method = "GET") => ({ request: new Request("https://nieuwsinkort.nl/media/beeld/images.nu.nl/a.jpg?w=1", { method, headers: { Accept: accept } }), waitUntil: (p: Promise<unknown>) => { wacht.push(p); } });
    mock(bron("AVIFBYTES"));
    const a = await onRequest(ctx(AVIF));
    assert.equal(await a.text(), "AVIFBYTES");
    await Promise.all(wacht);
    assert.deepEqual([...c.m.keys()], ["https://nieuwsinkort.nl/__beeldcache/avif/images.nu.nl/a.jpg?w=1"]);
    // andere emmer: geen hit, eigen upstream-fetch en eigen sleutel
    mock(bron("JPEGBYTES"));
    const b = await onRequest(ctx(BASIS));
    assert.equal(await b.text(), "JPEGBYTES");
    await Promise.all(wacht);
    assert.equal(calls.length, 1);
    assert.equal(c.m.size, 2);
    // hit in de eerste emmer: zelfde bytes, geen fetch, dezelfde headers
    mock(bron("NIETGEBRUIKT"));
    const hit = await onRequest(ctx(AVIF));
    assert.equal(calls.length, 0);
    assert.equal(await hit.text(), "AVIFBYTES");
    for (const h of ["content-type", "etag", "content-length", "cache-control", "x-content-type-options", "content-security-policy", "vary"]) assert.equal(hit.headers.get(h), a.headers.get(h), h);
    assert.equal(hit.headers.get("set-cookie"), null);
    assert.equal(hit.headers.get("vary"), "Accept");
    assert.equal(hit.headers.get("cache-control"), "public, max-age=86400");
    // HEAD op een hit: headers, geen body
    const head = await onRequest(ctx(AVIF, "HEAD"));
    assert.equal(calls.length, 0);
    assert.equal(head.headers.get("content-type"), "image/jpeg");
    assert.equal(await head.text(), "");
  } finally { zonderCache(); }
});

await t("Cache API: alleen geslaagde 200's; fouten, 404, 415, 413, te grote stream en HEAD worden niet opgeslagen", async () => {
  const c = nepCache();
  try {
    const wacht: Promise<unknown>[] = [];
    const v = async (rest: string, method = "GET") => { const r = await onRequest({ request: new Request(`https://nieuwsinkort.nl/media/beeld/${rest}`, { method }), waitUntil: (p) => { wacht.push(p); } }); await r.arrayBuffer().catch(() => {}); await Promise.all(wacht); return r; };
    mock(() => new Response("x", { status: 403 })); assert.equal((await v("images.nu.nl/a.jpg")).status, 502);
    mock(() => new Response("x", { status: 404 })); assert.equal((await v("images.nu.nl/b.jpg")).status, 404);
    mock(() => new Response("x", { status: 410 })); assert.equal((await v("images.nu.nl/c.jpg")).status, 502);
    mock(() => new Response("x", { status: 429 })); assert.equal((await v("images.nu.nl/c2.jpg")).status, 502);
    mock(() => new Response("<b>", { headers: { "content-type": "text/html" } })); assert.equal((await v("images.nu.nl/d.jpg")).status, 415);
    mock(jpg({ "content-length": String(6 * 1024 * 1024) })); assert.equal((await v("images.nu.nl/e.jpg")).status, 413);
    mock(() => new Response(new ReadableStream({ pull(k) { k.enqueue(new Uint8Array(1024 * 1024)); } }), { headers: { "content-type": "image/jpeg" } })); await v("images.nu.nl/f.jpg");
    mock(jpg()); assert.equal((await v("images.nu.nl/g.jpg", "HEAD")).status, 200);
    assert.equal(c.m.size, 0);
    mock(jpg()); assert.equal((await v("images.nu.nl/h.jpg")).status, 200);
    assert.equal(c.m.size, 1);
  } finally { zonderCache(); }
});

await t("zonder waitUntil wordt inline opgeslagen; zonder Cache API werkt de proxy gewoon", async () => {
  const c = nepCache();
  try {
    mock(jpg());
    const r = await vraag("images.nu.nl/a.jpg", "GET", { Accept: WEBP });
    assert.equal(await r.text(), "jpgbytes");
    assert.deepEqual([...c.m.keys()], ["https://nieuwsinkort.nl/__beeldcache/webp/images.nu.nl/a.jpg"]);
  } finally { zonderCache(); }
  mock(jpg());
  assert.equal(await (await vraag("images.nu.nl/a.jpg")).text(), "jpgbytes");
});

await t("redirects: hoofdletters, protocol-relatieve Location en :443 worden gevolgd en gecontroleerd", async () => {
  for (const loc of ["https://IMAGES.CDN.NOS.NL/b.jpg", "//images.cdn.nos.nl/b.jpg", "https://images.cdn.nos.nl:443/b.jpg"]) {
    mock(() => new Response(null, { status: 302, headers: { location: loc } }), jpg());
    assert.equal((await vraag("images.nu.nl/a.jpg")).status, 200, loc);
    assert.equal(calls[1].url, "https://images.cdn.nos.nl/b.jpg", loc);
  }
  for (const loc of ["//evil.example/b.jpg", "https://images.cdn.nos.nl:444/b.jpg", "https://EVIL.example/b.jpg"]) {
    mock(() => new Response(null, { status: 302, headers: { location: loc } }), jpg());
    assert.equal((await vraag("images.nu.nl/a.jpg")).status, 502, loc);
    assert.equal(calls.length, 1, loc);
  }
});

await t("HEAD: content-length en type komen mee zonder body", async () => {
  mock(jpg({ "content-length": "8" }));
  const h = await vraag("images.nu.nl/a.jpg", "HEAD");
  assert.equal(h.status, 200);
  assert.equal(h.headers.get("content-length"), "8");
  assert.equal(h.headers.get("content-type"), "image/jpeg");
  assert.equal(await h.text(), "");
});

await t("content-encoding upstream: content-length wordt niet doorgegeven", async () => {
  mock(jpg({ "content-length": "5", "content-encoding": "gzip" }));
  const r = await vraag("images.nu.nl/a.jpg");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-length"), null);
});

await t("body van redirect-, fout- en geweigerde antwoorden wordt geannuleerd", async () => {
  let geannuleerd = 0;
  const stroom = () => new ReadableStream({ pull(k) { k.enqueue(new Uint8Array(4)); }, cancel() { geannuleerd++; } });
  mock(() => new Response(stroom(), { status: 302, headers: { location: "https://images.cdn.nos.nl/b.jpg" } }), jpg());
  await vraag("images.nu.nl/a.jpg");
  mock(() => new Response(stroom(), { status: 503 })); await vraag("images.nu.nl/a.jpg");
  mock(() => new Response(stroom(), { headers: { "content-type": "text/html" } })); await vraag("images.nu.nl/a.jpg");
  mock(() => new Response(stroom(), { headers: { "content-type": "image/jpeg", "content-length": String(9 * 1024 * 1024) } })); await vraag("images.nu.nl/a.jpg");
  assert.equal(geannuleerd, 4);
});

await t("www.linda.nl alleen onder /lindanl-assets/ en /wp-content/; prod-img.dvhn.nl toegestaan", async () => {
  mock(jpg());
  assert.equal((await vraag("www.linda.nl/lindanl-assets/uploads/a.jpg")).status, 200);
  assert.equal((await vraag("www.linda.nl/wp-content/uploads/a.jpg")).status, 200);
  const n = calls.length;
  for (const p of ["www.linda.nl/", "www.linda.nl/recepten/a.jpg", "www.linda.nl/lindanl-assetsx/a.jpg", "www.linda.nl/api/x.jpg"]) assert.equal((await vraag(p)).status, 404, p);
  assert.equal(calls.length, n);
  mock(() => new Response(null, { status: 302, headers: { location: "https://www.linda.nl/geheim/a.jpg" } }), jpg());
  assert.equal((await vraag("images.nu.nl/a.jpg")).status, 502); // redirect buiten het prefix
  mock(jpg());
  assert.equal((await vraag("prod-img.dvhn.nl/public/a.jpg")).status, 200);
  assert.equal(beeldViaProxy("https://www.linda.nl/recepten/a.jpg"), "https://www.linda.nl/recepten/a.jpg");
  assert.equal(beeldViaProxy("https://www.linda.nl/lindanl-assets/uploads/a.jpg"), "/media/beeld/www.linda.nl/lindanl-assets/uploads/a.jpg");
});

await t("client en server weigeren dezelfde paden: //, %2F, %25 enz. blijven rechtstreeks", () => {
  for (const u of [
    "https://images.nu.nl/a//b.jpg", "https://images.nu.nl//a.jpg", "https://images.nu.nl/a%2Fb.jpg", "https://images.nu.nl/a%2fb.jpg", "https://images.nu.nl/a%25b.jpg",
    "https://images.nu.nl/a%5Cb.jpg", "https://images.nu.nl/a%2Eb.jpg", "https://images.nu.nl/a%00.jpg", "https://images.nu.nl/a.jpg?x=%5C".replace("%5C", "\\"), "https://images.nu.nl/", "https://images.nu.nl",
  ]) {
    assert.equal(beeldProxyPad(u), null, u);
    assert.equal(beeldViaProxy(u), u, u);
  }
  // en wat de client wel proxyt, accepteert de server ook
  for (const u of ["https://images.nu.nl/a%20b.jpg?w=1&h=2", "https://redactie.rtl.nl/sites/a.jpg?itok=XZ", "https://webp.vi.cdn.pxr.nl/a.webp"]) {
    const pad = beeldProxyPad(u)!;
    const [pp, q] = [pad.slice("/media/beeld/".length).split("?")[0], pad.includes("?") ? "?" + pad.split("?").slice(1).join("?") : ""];
    assert.ok(upstreamUrl(pp, q), u);
  }
});

console.log(`\n${n} tests ok`);
