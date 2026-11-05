import { test, expect, devices } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "View Transitions in Chromium");
  await page.addInitScript(() => {
    window.overgangen = 0;
    const start = document.startViewTransition?.bind(document);
    if (start) document.startViewTransition = (...args) => { window.overgangen++; return start(...args); };
  });
});

test("artikel openen en sluiten gebruikt overgangen", async ({ page }) => {
  await page.goto("#/");
  await page.locator(".nc-title a").first().click();
  await expect(page.locator(".detail .d-title")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.overgangen)).toBe(1);
  await page.locator(".detail .back").click();
  await expect(page.locator(".detail")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.overgangen)).toBe(2);
});

test("verminderde beweging navigeert zonder overgang", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("#/");
  await page.locator(".nc-title a").first().click();
  await expect(page.locator(".detail .d-title")).toBeVisible();
  await page.locator(".detail .back").click();
  await expect(page.locator(".detail")).toHaveCount(0);
  expect(await page.evaluate(() => window.overgangen)).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().duration > 0.01).length)).toBe(0);
});

test("zonder View Transition krijgt de lijst bij sluiten parallax", async ({ page }) => {
  await page.addInitScript(() => {
    document.startViewTransition = undefined;
    window.parallax = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, opties) {
      if (this.matches(".nf, main.wrap") && JSON.stringify(frames).includes("-24px")) window.parallax++;
      return animate.call(this, frames, opties);
    };
  });
  await page.goto("#/");
  await page.locator(".nc-title a").first().click();
  await expect(page.locator(".detail")).toBeVisible();
  await page.locator(".detail .back").click();
  await expect.poll(() => page.evaluate(() => window.parallax)).toBe(1);
});

test("tabwissel en browser-terug behouden inhoud zonder overgang", async ({ page }) => {
  await page.goto("#/");
  await expect(page.locator("#rubriek-paneel .nc-title a").first()).toBeVisible();
  await page.evaluate(() => {
    window.leegPaneel = false;
    new MutationObserver(() => {
      const paneel = document.querySelector("#rubriek-paneel");
      if (paneel && !paneel.querySelector(".nc-title a, .empty")) window.leegPaneel = true;
    }).observe(document.querySelector("#rubriek-paneel"), { childList: true, subtree: true });
  });
  await page.getByRole("tab", { name: /tech/i }).click();
  await expect(page).toHaveURL(/#\/tech$/);
  await expect(page.locator("#rubriek-paneel .nc-title a").first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator("#rubriek-paneel .nc-title a").first()).toBeVisible();
  expect(await page.evaluate(() => ({ overgangen: window.overgangen, leeg: window.leegPaneel }))).toEqual({ overgangen: 0, leeg: false });
});

test("eerste keer openen met vertraagde detail-chunk geeft geen lege snapshot", async ({ page }) => {
  await page.route(/\/(src\/detail\.tsx|assets\/detail-[^/]*\.js)(\?.*)?$/, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.addInitScript(() => {
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    window.legeSnapshot = null;
    document.startViewTransition = (cb) => start(async () => {
      await cb();
      window.legeSnapshot = !document.querySelector(".detail .d-title");
    });
  });
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await page.locator(".nc-title a").first().click();
  await expect(page.locator(".detail .d-title")).toBeVisible();
  expect(await page.evaluate(() => window.legeSnapshot)).toBe(false);
});

test("sluiten via browser-terug eindigt in de feed met overgang", async ({ page }) => {
  await page.goto("#/");
  await page.locator(".nc-title a").first().click();
  await expect(page.locator(".detail .d-title")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".detail")).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  expect(await page.evaluate(() => window.overgangen)).toBe(2);
});

test("video-routes starten geen overgang", async ({ page }) => {
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  for (const route of ["#/dumpert", "#/filmpjes", "#/"]) {
    await page.evaluate((r) => { location.hash = r; }, route);
    await expect(page).toHaveURL(new RegExp(`${route}$`));
  }
  expect(await page.evaluate(() => window.overgangen)).toBe(0);
});

test("terugvegen sluit het artikel zonder overgang", async ({ browser, baseURL }) => {
  const { defaultBrowserType: _d, ...iphone } = devices["iPhone 15"];
  const context = await browser.newContext({ ...iphone, baseURL });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.overgangen = 0;
    const start = document.startViewTransition?.bind(document);
    if (start) document.startViewTransition = (...args) => { window.overgangen++; return start(...args); };
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort("blockedbyclient"));
  await page.goto("#/");
  await page.locator(".nc-title a").first().click();
  await expect(page.locator("article.detail .d-lead").first()).toBeVisible();
  expect(await page.evaluate(() => window.overgangen)).toBe(1);
  const b = await page.locator("article.detail .d-lead").first().boundingBox();
  const y = Math.round(b.y + Math.min(b.height / 2, 12));
  const cdp = await context.newCDPSession(page);
  const punt = (i) => [{ x: 60 + (240 * i) / 8, y: y + (10 * i) / 8 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: punt(0) });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: punt(i) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("article.detail")).toHaveCount(0);
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  expect(await page.evaluate(() => window.overgangen)).toBe(1);
  await context.close();
});
