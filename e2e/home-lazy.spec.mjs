import { test, expect } from "@playwright/test";
import { deflateSync } from "node:zlib";

// #439: Home laadt bij de eerste lading geen hls-chunk, playlists, segmenten of mp4 en praat niet met media.dumpert.nl;
// Dumpert-posters lopen via /media/dumpert. Fixture-data, alle externe verzoeken geblokkeerd; nooit productie.
// Lokaal zonder Playwright-chromium: PW_CHROME=/usr/bin/google-chrome.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => { test.skip(info.project.name !== "chromium", "alleen het chromium-project"); });
test.use({ launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });

const nu = Date.now();
const dumpert = (n) => ({ titel: `Dumpertje ${n}`, ai: "", bron: "Dumpert", href: `https://www.dumpert.nl/item/${n}_abc`, embed: `https://media.dumpert.nl/dmp/media/video/ab12-cd${n}/index.m3u8`, thumb: `https://media.dumpert.nl/dmp/media/video/ab12-cd${n}/poster-small.jpg`, populariteit: "1 views", tijd: "12:00", soort: "short", t: nu - n * 60000 });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("Home: eerste lading zonder video-verkeer, posters via de proxy", async ({ page }) => {
  const verzoeken = [];
  page.on("request", (r) => verzoeken.push(r.url()));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort("blockedbyclient"));
  await page.route("**/media/dumpert/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/data.json*", async (route) => {
    const r = await route.fetch();
    const d = await r.json();
    d.dumpert = Array.from({ length: 6 }, (_, n) => dumpert(n));
    await route.fulfill({ response: r, json: d });
  });
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await page.waitForLoadState("load");
  await page.waitForTimeout(7000); // voorbij de idle-timeout (5 s) van het voorladen
  const proxy = verzoeken.filter((u) => u.includes("/media/dumpert/"));
  expect(proxy.some((u) => u.endsWith("poster-small.jpg")), "posters via de proxy").toBe(true);
  expect(proxy.filter((u) => /\.(m3u8|ts|m4s|mp4)(\?|$)/.test(u)), "geen playlists/segmenten").toEqual([]);
  expect(verzoeken.filter((u) => /hls/i.test(new URL(u).pathname)), "geen hls-chunk").toEqual([]);
  expect(verzoeken.filter((u) => u.includes("media.dumpert.nl")), "niets rechtstreeks").toEqual([]);
});

test("Home: tab Dumpert aanwijzen start daarna wel het voorladen van video", async ({ page }) => {
  const verzoeken = [];
  page.on("request", (r) => verzoeken.push(r.url()));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort("blockedbyclient"));
  await page.route("**/media/dumpert/**", (route) => route.fulfill({ status: 200, contentType: /m3u8/.test(route.request().url()) ? "application/vnd.apple.mpegurl" : "image/png", body: /m3u8/.test(route.request().url()) ? "#EXTM3U\n" : PNG }));
  await page.route("**/data.json*", async (route) => {
    const r = await route.fetch();
    const d = await r.json();
    d.dumpert = Array.from({ length: 6 }, (_, n) => dumpert(n));
    await route.fulfill({ response: r, json: d });
  });
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await page.locator('[data-video-tab]').first().hover();
  await expect.poll(() => verzoeken.filter((u) => /\/media\/dumpert\/.*\.m3u8/.test(u)).length).toBeGreaterThan(0);
});

// #473: artikelfoto's lopen via /media/beeld (geen cookies van derden); Home en artikel praten niet rechtstreeks met uitgeversbeeldhosts.
const BEELDHOSTS = ["prod-img.telegraaf.nl", "redactie.rtl.nl", "images.nu.nl", "images.cdn.nos.nl", "webp.br.cdn.pxr.nl", "cdn-2.motorsport.com", "images.ad.nl"];
test("Home en artikel: foto's via /media/beeld, niets rechtstreeks naar uitgeversbeeldhosts", async ({ page }) => {
  const verzoeken = [];
  page.on("request", (r) => verzoeken.push(r.url()));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort("blockedbyclient"));
  await page.route("**/media/beeld/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/data.json*", async (route) => {
    const r = await route.fetch();
    const d = await r.json();
    d.items = d.items.map((it, n) => ({ ...it, beeld: undefined, beelden: [`https://${BEELDHOSTS[n % BEELDHOSTS.length]}/public/foto%20${n}.jpg?width=1024&n=${n}`, `https://${BEELDHOSTS[(n + 1) % BEELDHOSTS.length]}/public/tweede-${n}.jpg`] }));
    await route.fulfill({ response: r, json: d });
  });
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  const homeBeelden = verzoeken.filter((u) => u.includes("/media/beeld/"));
  console.log(`beeldverzoeken Home (eerste lading): ${homeBeelden.length}`);
  expect(homeBeelden.length, "foto's via de proxy").toBeGreaterThan(0);
  expect(homeBeelden.every((u) => BEELDHOSTS.some((h) => u.includes(`/media/beeld/${h}/`))), "proxy-pad met host").toBe(true);
  await page.locator(".nc-title a").first().click();
  await expect(page.locator(".d-title").first()).toBeVisible();
  await page.waitForTimeout(1000);
  const alles = verzoeken.filter((u) => u.includes("/media/beeld/"));
  console.log(`beeldverzoeken Home + artikel: ${alles.length}`);
  expect(verzoeken.filter((u) => BEELDHOSTS.some((h) => new URL(u).hostname === h)), "niets rechtstreeks").toEqual([]);
});

// #473 vangnet: geeft de proxy een fout (bijv. botbescherming van de uitgever), dan laadt de foto één keer rechtstreeks en valt hij niet weg.
const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const groot = (() => { const w = 400, h = 300, ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc((w * 3 + 1) * h, 120))), chunk("IEND", Buffer.alloc(0))]); })();
test("Home: proxy geeft 403, foto laadt rechtstreeks en blijft zichtbaar (vangnet)", async ({ page }) => {
  const proxy = [], direct = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => { direct.push(route.request().url()); return route.fulfill({ status: 200, contentType: "image/png", body: groot }); });
  await page.route("**/media/beeld/**", (route) => { proxy.push(route.request().url()); return route.fulfill({ status: 403, body: "nee" }); });
  await page.route("**/data.json*", async (route) => {
    const r = await route.fetch();
    const d = await r.json();
    d.items = d.items.map((it, n) => ({ ...it, beeld: undefined, beelden: [`https://prod-img.telegraaf.nl/public/vangnet-${n}.jpg?w=1024`] }));
    await route.fulfill({ response: r, json: d });
  });
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const img = page.locator('img[src^="https://prod-img.telegraaf.nl/public/vangnet-"]').first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth)).toBe(400);
  expect(proxy.length, "proxy is eerst geprobeerd").toBeGreaterThan(0);
  expect(direct.some((u) => u.includes("prod-img.telegraaf.nl/public/vangnet-")), "daarna rechtstreeks").toBe(true);
  const dubbel = proxy.filter((u, i) => proxy.indexOf(u) !== i);
  expect(dubbel, "proxy per foto hooguit één keer").toEqual([]);
});
