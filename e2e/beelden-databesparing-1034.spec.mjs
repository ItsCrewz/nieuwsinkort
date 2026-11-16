import { test, expect } from "@playwright/test";
import { build } from "esbuild";

const bundel = await build({ entryPoints: ["e2e/fixtures/beelden-1034.tsx"], bundle: true, format: "iife", write: false });

for (const modus of ["besparing", "zonder-api"]) test(`beeldverzoeken bij ${modus}`, async ({ page }) => {
  const verzoeken = [];
  await page.route("https://beelden.test/**", (route) => {
    verzoeken.push(new URL(route.request().url()).pathname);
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"/>' });
  });
  await page.goto("about:blank");
  await page.setContent('<style>.bl-track{display:flex;overflow:auto;width:300px}.bl-slide{flex:0 0 300px}</style><div id="root"></div>');
  await page.evaluate((m) => {
    const v = new EventTarget();
    v.saveData = true;
    window.verbinding = v;
    Object.defineProperty(navigator, "connection", { configurable: true, value: m === "besparing" ? v : undefined });
  }, modus);
  await page.addScriptTag({ content: bundel.outputFiles[0].text });
  await expect.poll(() => verzoeken.includes("/0-0.svg")).toBe(true);
  if (modus === "zonder-api") {
    await expect.poll(() => verzoeken.includes("/0-1.svg") && verzoeken.includes("/1-0.svg")).toBe(true);
    return;
  }
  await page.waitForTimeout(400);
  expect(verzoeken).toEqual(["/0-0.svg"]);
  await page.getByRole("button", { name: "Volgende foto" }).first().click();
  await expect.poll(() => verzoeken.includes("/0-1.svg")).toBe(true);
  expect(verzoeken).not.toContain("/0-2.svg");
  expect(verzoeken).not.toContain("/1-0.svg");
  await page.evaluate(() => { window.verbinding.saveData = false; window.verbinding.dispatchEvent(new Event("change")); });
  await expect.poll(() => verzoeken.includes("/0-2.svg") && verzoeken.includes("/1-0.svg")).toBe(true);
});
