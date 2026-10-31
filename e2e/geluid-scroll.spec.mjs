import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Geluid bij doorscrollen (#437) op fixtures; nooit productie. Alle externe verzoeken geblokkeerd, data.json en media gestubd.
// Alleen Chromium: het WebKit-beleid wordt nagebootst met een autoplay-shim (per element ontgrendeld, 5 s na een gebaar).
// Lokaal zonder Playwright-chromium: PW_CHROME=/usr/bin/google-chrome.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => { test.skip(info.project.name !== "chromium", "alleen het chromium-project"); });
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });

const MEDIA = readFileSync("tests/fixtures/stil.webm");
const nu = Date.now();
const video = (n, bron, embed, extra = {}) => ({ titel: `Testfilmpje ${n}`, ai: "", bron, href: bron === "YouTube" ? `https://www.youtube.com/shorts/yt${n}abcdef` : bron === "Instagram" ? `https://www.instagram.com/reel/Xn${n}abc/` : `https://www.dumpert.nl/item/${n}_abc`, embed, thumb: "", populariteit: "1 views", tijd: "12:00", soort: "short", t: nu - n * 60000, ...extra });
const mp4 = (n) => `https://media.test/${n}.mp4`;
const igMp4 = (n) => `https://scontent.cdninstagram.com/v/${n}.mp4`;
const DATA = {
  dumpert: Array.from({ length: 6 }, (_, n) => video(n, "Dumpert", mp4(`d${n}`))),
  filmpjes: [video(0, "Instagram", igMp4("i0")), video(1, "YouTube", `https://www.youtube-nocookie.com/embed/yt1abcdef`), video(2, "Instagram", igMp4("i2")), video(3, "YouTube", `https://www.youtube-nocookie.com/embed/yt3abcdef`), video(4, "Instagram", igMp4("i4"))],
};

// Nabootsing van de YouTube-iframe: onReady, en een weigering van geluid (onAutoplayBlocked) bij unMute.
const YT_HTML = `<!doctype html><script>
const post = (m) => parent.postMessage(JSON.stringify(m), "*");
addEventListener("message", (e) => { let d; try { d = JSON.parse(e.data); } catch { return; }
  if (d.event === "listening") post({ event: "onReady" });
  if (d.event !== "command") return;
  if (d.func === "unMute") post({ event: "onAutoplayBlocked" });
  if (d.func === "playVideo") post({ event: "onStateChange", info: 1 });
});
post({ event: "onReady" });
</script>`;

// WebKit-achtige autoplay-shim (zie nik-geluid-scroll-meting/scroll.mjs).
const shim = () => {
  if (window.__wk) return;
  const log = (window.__wk = []);
  const unlocked = new WeakSet();
  let last = -1e9, nu = false;
  const act = (e) => { if (!e.isTrusted) return; last = performance.now(); nu = true; setTimeout(() => { nu = false; }, 0); };
  for (const t of ["touchend", "click", "keydown", "mousedown"]) window.addEventListener(t, act, { capture: true });
  const g = () => nu || performance.now() - last < 5000;
  const P = HTMLMediaElement.prototype, play = P.play, d = Object.getOwnPropertyDescriptor(P, "muted");
  P.play = function () {
    if (!unlocked.has(this) && !this.muted && this.volume > 0 && !g()) { log.push("REJECT play"); return Promise.reject(new DOMException("wk-shim", "NotAllowedError")); }
    if (g()) unlocked.add(this);
    return play.call(this);
  };
  Object.defineProperty(P, "muted", { configurable: true, get() { return d.get.call(this); }, set(v) {
    if (g()) unlocked.add(this);
    d.set.call(this, v);
    if (!v && !unlocked.has(this) && !this.paused) { log.push("PAUSE unmute-zonder-gebaar"); this.pause(); }
  } });
};

async function start(page, cat, { oudeTik = false } = {}) {
  const fouten = [];
  page.on("pageerror", (f) => fouten.push(f.message));
  await page.addInitScript(shim);
  if (oudeTik) await page.addInitScript(() => { try { sessionStorage.setItem("nieuwsinkort-geluid-tik", "1"); } catch {} });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => {
    const u = route.request().url();
    if (/^https:\/\/(media\.test|scontent\.cdninstagram\.com)\//.test(u)) return route.fulfill({ status: 200, contentType: "video/webm", body: MEDIA, headers: { "accept-ranges": "none" } });
    if (/^https:\/\/www\.youtube-nocookie\.com\/embed\//.test(u)) return route.fulfill({ status: 200, contentType: "text/html", body: YT_HTML });
    return route.abort("blockedbyclient");
  });
  await page.route("**/data.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ gegenereerd: new Date().toISOString(), datum: "31 oktober 2026", dag_samenvatting: "", weer: {}, items: [], ...DATA }) }));
  await page.goto(`/#/${cat}`);
  await page.locator(".vcard-open").first().tap();
  await expect(page.locator('.fslide[aria-current="true"]')).toBeVisible();
  return fouten;
}

const swipe = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  const x = 195, y0 = 650, y1 = 150;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let k = 1; k <= 10; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + (y1 - y0) * k / 10 }] }); await page.waitForTimeout(16); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
};
const actief = (page) => page.evaluate(() => {
  const sl = document.querySelector('.fslide[aria-current="true"]');
  const v = sl?.querySelector("video");
  return { i: Number(sl?.dataset.i), yt: !!sl?.querySelector("iframe.f-yt"), muted: v?.muted, paused: v?.paused, knop: document.querySelector(".f-sound")?.getAttribute("aria-label"), shim: window.__wk.splice(0) };
});
const naSwipe = async (page, i) => { await swipe(page); await expect.poll(async () => (await actief(page)).i, { timeout: 8000 }).toBe(i); await page.waitForTimeout(600); };

test("Dumpert: na de tik blijft het geluid aan bij doorswipen", async ({ page }) => {
  const fouten = await start(page, "dumpert");
  await page.touchscreen.tap(195, 450);
  await page.waitForTimeout(800);
  for (let i = 1; i <= 4; i++) {
    await naSwipe(page, i);
    const s = await actief(page);
    expect(s.muted, `slide ${i}`).toBe(false);
    expect(s.paused, `slide ${i}`).toBe(false);
    expect(s.knop).toBe("Geluid uit");
  }
  expect(fouten).toEqual([]);
});

test("Instagram → YouTube (geblokkeerd) → Instagram: native slide heeft weer geluid", async ({ page }) => {
  await start(page, "filmpjes");
  await page.touchscreen.tap(195, 450);
  await page.waitForTimeout(800);
  expect((await actief(page)).muted).toBe(false);
  await naSwipe(page, 1);
  await expect.poll(async () => (await actief(page)).knop, { timeout: 8000 }).toBe("Tik in de video voor geluid");
  await naSwipe(page, 2);
  const s = await actief(page);
  expect(s.yt).toBe(false);
  expect(s.muted).toBe(false);
  expect(s.paused).toBe(false);
  expect(s.knop).toBe("Geluid uit");
});

test("de eerste geluidstik pauzeert de video niet, de tweede wel", async ({ page }) => {
  await start(page, "dumpert");
  expect((await actief(page)).muted).toBe(true);
  await page.touchscreen.tap(195, 450);
  await page.waitForTimeout(900);
  let s = await actief(page);
  expect(s.muted).toBe(false);
  expect(s.paused).toBe(false);
  await page.waitForTimeout(800);
  await page.touchscreen.tap(195, 450);
  await page.waitForTimeout(300);
  expect((await actief(page)).paused).toBe(true);
});

test("de knop zet het geluid vóór de eerste tik niet uit", async ({ page }) => {
  await start(page, "dumpert");
  expect((await actief(page)).knop).toBe("Tik voor geluid");
  await page.locator(".f-sound").tap();
  await page.waitForTimeout(500);
  const s = await actief(page);
  expect(s.muted).toBe(false);
  expect(s.knop).toBe("Geluid uit");
  expect(await page.evaluate(() => localStorage.getItem("nieuwsinkort-geluid"))).not.toBe("0");
});

test("herladen met een oude tikvlag: gedempt start zonder NotAllowedError", async ({ page }) => {
  const fouten = await start(page, "dumpert", { oudeTik: true });
  await page.waitForTimeout(1500);
  const s = await actief(page);
  expect(s.muted).toBe(true);
  expect(s.paused).toBe(false);
  expect(s.knop).toBe("Tik voor geluid");
  expect(s.shim).toEqual([]);
  expect(await page.locator("video[data-autoplay-blokkade]").count()).toBe(0);
  await page.touchscreen.tap(195, 450);
  await page.waitForTimeout(800);
  expect((await actief(page)).muted).toBe(false);
  expect(fouten).toEqual([]);
});

test("pool blijft 3 video's en alleen actief + volgende hebben een bron", async ({ page }) => {
  await start(page, "dumpert");
  await page.touchscreen.tap(195, 450);
  for (let i = 0; i <= 4; i++) {
    if (i) await naSwipe(page, i);
    const t = await page.evaluate(() => ({ alle: document.querySelectorAll("video").length, metBron: [...document.querySelectorAll("video")].filter((v) => v.getAttribute("src")).length }));
    expect(t.alle).toBeLessThanOrEqual(3);
    expect(t.metBron).toBeLessThanOrEqual(2);
  }
});
