import { test, expect, devices } from "@playwright/test";

// Terugvegen in een artikel (iPhone-emulatie, echte aanraakgebeurtenissen via CDP). Fixture-data, externe verzoeken geblokkeerd.
// Lokaal zonder Playwright-chromium: PW_CHROME=/usr/bin/google-chrome.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => { test.skip(info.project.name !== "chromium", "alleen het chromium-project"); });
const { defaultBrowserType: _d, ...iphone } = devices["iPhone 15"];
test.use({ ...iphone, launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });

async function veeg(page, van, naar, stappen = 8) {
  const cdp = await page.context().newCDPSession(page);
  const punt = (i) => [{ x: van[0] + ((naar[0] - van[0]) * i) / stappen, y: van[1] + ((naar[1] - van[1]) * i) / stappen }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: punt(0) });
  for (let i = 1; i <= stappen; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: punt(i) });
  return { eind: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }) };
}

// Scrollcontainer van de feed (nu de kaartenlijst zelf, geen window).
const feedScroller = (page) => page.locator(".nc").first().evaluateHandle((n) => { let e = n.parentElement; while (e && !/^(auto|scroll)$/.test(getComputedStyle(e).overflowY)) e = e.parentElement; return e; });

// naKaart: scroll eerst naar die kaart en open het artikel daar (anders de eerste kaart).
async function openArtikel(page, naKaart = 0) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort("blockedbyclient"));
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  if (naKaart) {
    const sc = await feedScroller(page);
    await sc.evaluate((e, k) => { e.scrollTop = e.querySelectorAll(".nc")[k].offsetTop; }, naKaart);
    await expect.poll(() => sc.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  }
  const kop = page.locator(".nc-title a").nth(naKaart);
  await expect(kop).toBeVisible();
  await kop.click();
  await expect(page.locator("article.detail")).toBeVisible();
  await expect(page.locator("article.detail .d-lead").first()).toBeVisible();
}

// Startpunt op de leadtekst: een vast y-punt raakt soms een afbeelding in een horizontaal scrollbaar blok (laadvolgorde), en dat negeert de hook bewust.
async function startY(page) {
  const b = await page.locator("article.detail .d-lead").first().boundingBox();
  return Math.round(b.y + Math.min(b.height / 2, 12));
}

test("veeg naar rechts sluit het artikel", async ({ page }) => {
  await openArtikel(page);
  const y = await startY(page);
  const g = await veeg(page, [60, y], [300, y + 10]);
  await g.eind();
  await expect(page.locator("article.detail")).toHaveCount(0);
  await expect(page.locator(".nc-title a").first()).toBeVisible();
});

test("korte veeg veert terug en laat het artikel staan", async ({ page }) => {
  await openArtikel(page);
  const y = await startY(page);
  const g = await veeg(page, [60, y], [110, y + 2], 4);
  await expect.poll(() => page.locator("article.detail").evaluate((e) => e.style.transform)).toContain("translateX");
  await g.eind();
  await expect.poll(() => page.locator("article.detail").evaluate((e) => e.style.transform)).toBe("");
  await expect(page.locator("article.detail")).toBeVisible();
});

test("veeg vanaf de linkerrand wordt genegeerd (iOS-randgebaar)", async ({ page }) => {
  await openArtikel(page);
  const y = await startY(page);
  const g = await veeg(page, [5, y], [300, y + 5]);
  expect(await page.locator("article.detail").evaluate((e) => e.style.transform)).toBe("");
  await g.eind();
  await expect(page.locator("article.detail")).toBeVisible();
});

test("verticaal scrollen sluit het artikel niet", async ({ page }) => {
  await openArtikel(page);
  const g = await veeg(page, [200, 600], [230, 200]);
  await g.eind();
  await expect(page.locator("article.detail")).toBeVisible();
  expect(await page.locator("article.detail").evaluate((e) => e.style.transform)).toBe("");
});

// Eindpositie na terugvegen: dezelfde kaart staat weer in beeld en de feed staat op dezelfde scrollpositie (#512).
async function terugOpDezelfdeKaart(page, reduced) {
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await openArtikel(page, 2);
  const titel = (await page.locator("article.detail h1").first().innerText()).trim();
  const y = await startY(page);
  const g = await veeg(page, [60, y], [300, y + 10]);
  await g.eind();
  await expect(page.locator("article.detail")).toHaveCount(0);
  const kaart = page.locator(".nc", { hasText: titel }).first();
  await expect(kaart).toBeInViewport({ ratio: 0.5 });
  const sc = await feedScroller(page);
  expect(await sc.evaluate((e, t) => { const k = [...e.querySelectorAll(".nc")].findIndex((n) => n.textContent.includes(t)); return k; }, titel)).toBe(2);
  expect(await sc.evaluate((e) => Math.abs(e.scrollTop - e.querySelectorAll(".nc")[2].offsetTop))).toBeLessThan(3);
}

test("terugvegen brengt je terug op dezelfde kaart en scrollpositie", async ({ page }) => { await terugOpDezelfdeKaart(page, false); });

test("terugvegen werkt ook met beperkte beweging (zonder animatie)", async ({ page }) => {
  await terugOpDezelfdeKaart(page, true);
});

test("korte veeg sluit niet, ook niet met beperkte beweging", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openArtikel(page);
  const y = await startY(page);
  const g = await veeg(page, [60, y], [60 + 35, y + 2], 4); // 35 px: onder de drempel (30%) en onder FLICK_MIN, dus ook een snelle veeg sluit niet
  await g.eind();
  await expect(page.locator("article.detail")).toBeVisible();
  expect(await page.locator("article.detail").evaluate((e) => e.style.transform)).toBe("");
});
