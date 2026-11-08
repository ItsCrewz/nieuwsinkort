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
  await expect(page.locator("article.detail .d-lead").first()).toBeVisible();
}

// Startpunt op de leadtekst: een vast y-punt raakt soms een afbeelding in een horizontaal scrollbaar blok (laadvolgorde), en dat negeert de hook bewust.
async function startY(page) {
  // Wacht tot de intree-animatie klaar is: pas dan raakt het punt echt het artikel (de hook negeert aanrakingen erbuiten).
  let y = 0;
  await expect.poll(async () => {
    const b = await page.locator("article.detail .d-lead").first().boundingBox();
    y = Math.round(b.y + Math.min(b.height / 2, 12));
    return page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest("article.detail"), [60, y]);
  }).toBe(true);
  return y;
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

test("een veeg buiten het artikel, op het deelportaal of op een uitgesloten kind doet niets", async ({ page }) => {
  await openArtikel(page);
  await page.evaluate(() => {
    const buiten = document.createElement("div");
    buiten.id = "veeg-buiten";
    buiten.style.cssText = "position:fixed;z-index:9999;left:40px;top:100px;width:300px;height:40px";
    document.body.append(buiten);
    const kind = document.createElement("input");
    kind.id = "veeg-invoer";
    kind.style.cssText = "position:fixed;z-index:9999;left:40px;top:200px;width:300px;height:40px";
    document.querySelector("article.detail").append(kind);
  });
  for (const selector of ["#veeg-buiten", ".deel-knop", "#veeg-invoer"]) {
    const vak = await page.locator(selector).boundingBox();
    const y = Math.round(vak.y + vak.height / 2);
    const x = Math.max(25, Math.round(vak.x + Math.min(vak.width / 2, 20)));
    const g = await veeg(page, [x, y], [x + 200, y]);
    expect(await page.locator("article.detail").evaluate((e) => e.style.transform)).toBe("");
    await g.eind();
    await expect(page.locator("article.detail")).toBeVisible();
  }
});
