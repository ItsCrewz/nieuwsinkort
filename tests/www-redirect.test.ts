import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { onRequest, wwwDoel } from "../functions/_middleware";

const t = async (naam: string, f: () => void | Promise<void>) => { await f(); console.log(`✓ ${naam}`); };
const draai = (url: string) => {
  let door = 0;
  return onRequest({ request: new Request(url), next: async () => { door++; return new Response("ok"); } }).then((r) => ({ r, door }));
};

await t("www → 301 met pad en query behouden", async () => {
  const { r, door } = await draai("https://www.nieuwsinkort.nl/test?x=1&y=%20a");
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "https://nieuwsinkort.nl/test?x=1&y=%20a");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(door, 0);
});
await t("www-root en hoofdletters", async () => {
  assert.equal((await draai("https://www.nieuwsinkort.nl/")).r.headers.get("location"), "https://nieuwsinkort.nl/");
  assert.equal((await draai("https://WWW.NieuwsInKort.nl/a/b")).r.headers.get("location"), "https://nieuwsinkort.nl/a/b");
  assert.equal((await draai("http://www.nieuwsinkort.nl/?q=1")).r.headers.get("location"), "https://nieuwsinkort.nl/?q=1");
});
await t("apex, pages.dev en andere hosts ongemoeid", async () => {
  for (const u of ["https://nieuwsinkort.nl/", "https://www.nieuwsinkort.nl.evil.nl/", "https://xwww.nieuwsinkort.nl/"]) {
    const { r, door } = await draai(u);
    assert.equal(r.status, 200, u);
    assert.equal(door, 1, u);
  }
  assert.equal(wwwDoel("geen url"), null);
});
await t("pages.dev (productie) → 301 met pad en query", async () => {
  const { r, door } = await draai("https://nieuwsinkort.pages.dev/a/b?x=1&y=%20a");
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "https://nieuwsinkort.nl/a/b?x=1&y=%20a");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(door, 0);
  assert.equal((await draai("https://NieuwsInKort.pages.dev/")).r.headers.get("location"), "https://nieuwsinkort.nl/");
});
await t("pages.dev: POST /samenvatting niet geredirect, body bereikt handler, wel noindex", async () => {
  let body = "";
  const next = async () => { body = "bereikt"; return new Response("ok"); };
  const r = await onRequest({ request: new Request("https://nieuwsinkort.pages.dev/samenvatting", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }), next });
  assert.equal(r.status, 200);
  assert.equal(body, "bereikt");
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
});
await t("pages.dev: GET API-/functieroutes en assets niet geredirect, wel noindex", async () => {
  for (const p of ["/data.json", "/version.json", "/samenvatting", "/meer?id=1", "/media/dumpert/a/b.m3u8", "/media/beeld/x/y.png", "/bronnen.json", "/assets/a.js"]) {
    const { r, door } = await draai("https://nieuwsinkort.pages.dev" + p);
    assert.equal(r.status, 200, p);
    assert.equal(door, 1, p);
    assert.equal(r.headers.get("x-robots-tag"), "noindex", p);
  }
});
await t("pages.dev: HEAD op pagina 301, POST op pagina niet", async () => {
  const next = async () => new Response("ok");
  assert.equal((await onRequest({ request: new Request("https://nieuwsinkort.pages.dev/dumpert", { method: "HEAD" }), next })).status, 301);
  assert.equal((await onRequest({ request: new Request("https://nieuwsinkort.pages.dev/", { method: "POST", body: "x" }), next })).status, 200);
  assert.equal((await draai("https://nieuwsinkort.pages.dev/index.html?a=1")).r.headers.get("location"), "https://nieuwsinkort.nl/index.html?a=1");
});
await t("www: POST wordt nog steeds geredirect (ongewijzigd)", async () => {
  const r = await onRequest({ request: new Request("https://www.nieuwsinkort.nl/samenvatting", { method: "POST", body: "x" }), next: async () => new Response("ok") });
  assert.equal(r.status, 301);
});
await t("preview-host: geen redirect, wel noindex en overige headers behouden", async () => {
  const next = async () => new Response("ok", { status: 200, headers: { "Strict-Transport-Security": "max-age=1", "X-Test": "a" } });
  for (const u of ["https://abc123.nieuwsinkort.pages.dev/x?y=1", "https://nik-515.nieuwsinkort.pages.dev/"]) {
    const r = await onRequest({ request: new Request(u), next });
    assert.equal(r.status, 200, u);
    assert.equal(r.headers.get("x-robots-tag"), "noindex", u);
    assert.equal(r.headers.get("strict-transport-security"), "max-age=1");
    assert.equal(r.headers.get("x-test"), "a");
    assert.equal(await r.text(), "ok");
  }
  assert.equal(wwwDoel("https://abc.nieuwsinkort.pages.dev/"), null);
});
await t("apex, www-doel en vreemde pages.dev-hosts krijgen geen noindex", async () => {
  for (const u of ["https://nieuwsinkort.nl/", "https://evilnieuwsinkort.pages.dev/", "https://nieuwsinkort.pages.dev.evil.nl/"]) {
    const { r } = await draai(u);
    assert.equal(r.status, 200, u);
    assert.equal(r.headers.get("x-robots-tag"), null, u);
  }
});
await t("_routes.json: geldig, binnen 100 regels, functieroutes niet uitgesloten", () => {
  const j = JSON.parse(readFileSync("public/_routes.json", "utf8"));
  assert.equal(j.version, 1);
  assert.ok(j.include.length + j.exclude.length <= 100);
  assert.ok(j.include.includes("/*"));
  const naarRegex = (p: string) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  const uitgesloten = (pad: string) => j.exclude.some((p: string) => naarRegex(p).test(pad));
  for (const pad of ["/", "/data.json", "/meer", "/samenvatting", "/media/dumpert/a/b.m3u8", "/dumpert", "/test"]) assert.ok(!uitgesloten(pad), pad);
  // #473: geen brede /*.png-regel; die sloot ook /media/beeld/.../x.png uit, zodat de Function nooit draaide
  for (const pad of ["/media/beeld/webp.vi.cdn.pxr.nl/news/a/x.png", "/media/beeld/images.nu.nl/a.png", "/media/beeld/x/y.svg"]) assert.ok(!uitgesloten(pad), pad);
  // elk statisch bestand dat vroeger door de wildcards (*.png/svg/ico/woff2) werd uitgesloten, blijft uitgesloten
  const statisch = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? statisch(d + "/" + e.name) : [d + "/" + e.name]);
  for (const dir of ["public", "dist"]) {
    if (!existsSync(dir)) continue;
    for (const f of statisch(dir).filter((f) => /\.(png|svg|ico|woff2)$/.test(f))) assert.ok(uitgesloten(f.slice(dir.length)), f);
  }
  for (const pad of ["/assets/index-abc.js", "/fonts/inter-latin.woff2", "/favicon.svg", "/robots.txt"]) assert.ok(uitgesloten(pad), pad);
});
