import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  for (const u of ["https://nieuwsinkort.nl/", "https://nieuwsinkort.pages.dev/x?y=1", "https://www.nieuwsinkort.nl.evil.nl/", "https://xwww.nieuwsinkort.nl/"]) {
    const { r, door } = await draai(u);
    assert.equal(r.status, 200, u);
    assert.equal(door, 1, u);
  }
  assert.equal(wwwDoel("geen url"), null);
});
await t("_routes.json: geldig, binnen 100 regels, functieroutes niet uitgesloten", () => {
  const j = JSON.parse(readFileSync("public/_routes.json", "utf8"));
  assert.equal(j.version, 1);
  assert.ok(j.include.length + j.exclude.length <= 100);
  assert.ok(j.include.includes("/*"));
  const naarRegex = (p: string) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  const uitgesloten = (pad: string) => j.exclude.some((p: string) => naarRegex(p).test(pad));
  for (const pad of ["/", "/data.json", "/meer", "/samenvatting", "/media/dumpert/a/b.m3u8", "/dumpert", "/test"]) assert.ok(!uitgesloten(pad), pad);
  for (const pad of ["/assets/index-abc.js", "/fonts/inter-latin.woff2", "/favicon.svg", "/robots.txt"]) assert.ok(uitgesloten(pad), pad);
});
