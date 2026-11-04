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

async function openArtikel(page) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort("blockedbyclient"));
  await page.goto("#/");
  const kop = page.locator(".nc-title a").first();
  await expect(kop).toBeVisible();
  await kop.click();
  await expect(page.locator("article.detail")).toBeVisible();
}

test("veeg naar rechts sluit het artikel", async ({ page }) => {
  await openArtikel(page);
  const g = await veeg(page, [60, 400], [300, 410]);
  await g.eind();
  await expect(page.locator("article.detail")).toHaveCount(0);
  await expect(page.locator(".nc-title a").first()).toBeVisible();
});

test("korte veeg veert terug en laat het artikel staan", async ({ page }) => {
  await openArtikel(page);
  const g = await veeg(page, [60, 400], [110, 402], 4);
  await expect.poll(() => page.locator("article.detail").evaluate((e) => e.style.transform)).toContain("translateX");
  await g.eind();
  await expect.poll(() => page.locator("article.detail").evaluate((e) => e.style.transform)).toBe("");
  await expect(page.locator("article.detail")).toBeVisible();
});

test("veeg vanaf de linkerrand wordt genegeerd (iOS-randgebaar)", async ({ page }) => {
  await openArtikel(page);
  const g = await veeg(page, [5, 400], [300, 405]);
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
