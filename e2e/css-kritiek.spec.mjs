import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// CSS gesplitst (css-kritiek): de beweging-CSS laadt na de eerste paint en wordt dan toegepast; zonder dat bestand rendert de pagina nog correct.
// Fixture-data, externe verzoeken geblokkeerd. Lokaal zonder Playwright-chromium: PW_CHROME=/usr/bin/google-chrome.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => { test.skip(info.project.name !== "chromium", "alleen het chromium-project"); });
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });

const blokkeerExtern = (page) => page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort("blockedbyclient"));
const duur = (page, sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).transitionDuration, sel);
const isUitgesteld = (url) => /uitgesteld/.test(url);

test("na laden wordt de uitgestelde beweging-CSS toegepast", async ({ page }) => {
  await blokkeerExtern(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  // .nc-title a krijgt zijn transition (140ms) pas uit uitgesteld.css
  await expect.poll(() => duur(page, ".nc-title a"), { timeout: 10000 }).toBe("0.14s");
  await expect.poll(() => page.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.name === "svup"); } catch { return false; } }))).toBe(true);
});

test("zonder de uitgestelde CSS rendert de pagina nog correct (geen beweging, wel layout)", async ({ page }) => {
  await blokkeerExtern(page);
  await page.route(isUitgesteld, (route) => route.abort("failed"));
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await page.waitForTimeout(2500); // ruim na load + idle: de import is dan al geprobeerd en mislukt
  expect(await duur(page, ".nc-title a")).toBe("0s");
  const m = await page.evaluate(() => {
    const kaart = document.querySelector(".nc").getBoundingClientRect();
    const nf = document.querySelector(".nf");
    return { kaart: [Math.round(kaart.width), Math.round(kaart.height)], snap: getComputedStyle(nf).scrollSnapType, breedte: document.documentElement.scrollWidth };
  });
  expect(m.kaart[0]).toBeGreaterThan(300);
  expect(m.kaart[1]).toBeGreaterThan(300);
  expect(m.snap).toMatch(/y/);
  expect(m.breedte).toBeLessThanOrEqual(390);
});

test("laden van de uitgestelde CSS veroorzaakt geen layoutverschuiving", async ({ page }) => {
  await blokkeerExtern(page);
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const voor = await page.locator(".nc").first().boundingBox();
  await expect.poll(() => duur(page, ".nc-title a"), { timeout: 10000 }).toBe("0.14s");
  const na = await page.locator(".nc").first().boundingBox();
  expect(na).toEqual(voor);
  expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.01);
});

test("prefers-reduced-motion blijft gerespecteerd na het laden", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await blokkeerExtern(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".nc-title a")).transitionDuration));
  expect(s).toBeLessThan(0.001);
});

// Het binnenkomen van de uitgestelde CSS mag op al zichtbare elementen geen animatie starten (geen flits, geen opnieuw infaden).
// Het CSS-verzoek wordt vastgehouden tot de test het vrijgeeft; getAnimations() telt alleen eindige animaties (spinner/glans lopen oneindig).
const MEDIA = readFileSync("tests/fixtures/stil.webm");
const eindig = () => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.animationName || a.transitionProperty);
async function houdUitgesteld(page) {
  let vrij; const poort = new Promise((r) => { vrij = r; });
  await page.route(isUitgesteld, async (route) => { await poort; await route.continue(); });
  return vrij;
}
// Registreert per frame de opacity van een selector, zodat een kortstondige flits zichtbaar wordt.
const volgOpacity = (page, sel) => page.evaluate((s) => {
  window.__op = new Set();
  const tik = () => { const e = document.querySelector(s); if (e) window.__op.add(getComputedStyle(e).opacity); requestAnimationFrame(tik); };
  tik();
}, sel);

test("scrollen vóór de uitgestelde CSS: .nf-start.off wordt niet opnieuw zichtbaar", async ({ page }) => {
  await blokkeerExtern(page);
  const vrij = await houdUitgesteld(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await page.evaluate(() => { const f = document.querySelector(".nf"); f.scrollTo({ top: 100, behavior: "instant" }); });
  await expect(page.locator(".nf-start")).toHaveClass(/off/);
  await page.waitForTimeout(500);
  expect(await duur(page, ".nc-title a")).toBe("0s"); // sheet is er echt nog niet
  await volgOpacity(page, ".nf-start");
  vrij();
  await expect.poll(() => duur(page, ".nc-title a"), { timeout: 10000 }).toBe("0.14s");
  await page.waitForTimeout(600); // ruim langer dan de 300 ms nfs-animatie
  expect(await page.evaluate(eindig)).toEqual([]);
  expect(await page.evaluate(() => [...window.__op])).toEqual(["0"]);
});

test("videofeed geopend vóór de uitgestelde CSS: geen opnieuw infaden", async ({ page }) => {
  await blokkeerExtern(page);
  await page.route(/^https:\/\/media\.test\//, (route) => route.fulfill({ status: 200, contentType: "video/webm", body: MEDIA, headers: { "accept-ranges": "none" } }));
  const items = Array.from({ length: 3 }, (_, n) => ({ titel: `Testfilmpje ${n}`, ai: "", bron: "Dumpert", href: `https://www.dumpert.nl/item/${n}_abc`, embed: `https://media.test/d${n}.mp4`, thumb: "", populariteit: "1 views", tijd: "12:00", soort: "short", t: Date.now() - n * 60000 }));
  await page.route("**/data.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ gegenereerd: new Date().toISOString(), datum: "31 oktober 2026", dag_samenvatting: "", weer: {}, items: [], dumpert: items, filmpjes: [] }) }));
  const vrij = await houdUitgesteld(page);
  await page.goto("#/dumpert");
  await page.locator(".vcard-open").first().tap();
  await expect(page.locator(".feed")).toBeVisible();
  await page.waitForTimeout(400); // de kritieke intro is dan klaar
  expect(await duur(page, ".f-btn")).toBe("0s");
  await volgOpacity(page, ".feed");
  vrij();
  await expect.poll(() => duur(page, ".f-btn"), { timeout: 10000 }).not.toBe("0s");
  await page.waitForTimeout(500);
expect(await page.evaluate(() => document.getAnimations().filter((a) => (a.animationName === "fadein" || a.animationName === "nfs") && a.playState === "running").length)).toBe(0);
  expect(await page.evaluate(() => [...window.__op])).toEqual(["1"]);
});

// Animaties van gebruikersinteractie tijdens een traag CSS-verzoek (artikelovergang, kaartentree) mogen niet worden geannuleerd.
// Via CDP lopen alle animaties 100x trager, zodat ze het vrijgeven van de sheet overleven zonder dat de test van timing afhangt.
test("interactie-animatie tijdens vertraagd CSS-verzoek loopt normaal door", async ({ page }) => {
  await blokkeerExtern(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.01 });
  const vrij = await houdUitgesteld(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  expect(await duur(page, ".nc-title a")).toBe("0s"); // sheet is er echt nog niet
  // routewissel: .page-in { animation: up } (kritiek) start door een gebruikersactie, zonder View Transition
  await page.evaluate(() => { location.hash = "#/dumpert"; });
  await expect.poll(() => page.evaluate(() => document.getAnimations().some((a) => a.animationName === "up" || a.animationName === "fadein"))).toBe(true);
  const n = await page.evaluate(() => {
    window.__ia = document.getAnimations().filter((a) => !a.effect?.pseudoElement && a.effect?.getComputedTiming().iterations !== Infinity);
    window.__ia.forEach((a) => { a.finished.catch(() => { a.__geannuleerd = true; }); });
    return window.__ia.length;
  });
  expect(n).toBeGreaterThan(0);
  vrij();
  await expect.poll(() => duur(page, ".nc-title a, .back, .iconbtn"), { timeout: 10000 }).not.toBe("0s");
  await page.waitForTimeout(300);
  const staat = await page.evaluate(() => window.__ia.map((a) => [a.animationName, a.playState, !!a.__geannuleerd]));
  expect(staat.filter((s) => s[2] || s[1] === "idle")).toEqual([]);
});
