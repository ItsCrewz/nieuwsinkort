import { test, expect } from "@playwright/test";

// CSS gesplitst (css-kritiek): de beweging-CSS laadt na de eerste paint en wordt dan toegepast; zonder dat bestand rendert de pagina nog correct.
// Fixture-data, externe verzoeken geblokkeerd. Lokaal zonder Playwright-chromium: PW_CHROME=/usr/bin/google-chrome.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => { test.skip(info.project.name !== "chromium", "alleen het chromium-project"); });
test.use({ viewport: { width: 390, height: 844 }, launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });

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
