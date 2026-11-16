import { test, expect } from "@playwright/test";
import { build } from "esbuild";

const bundel = await build({ entryPoints: ["e2e/fixtures/beelden-databesparing-1034.tsx"], bundle: true, format: "iife", write: false });

test("databesparing voorkomt speculatieve beeldverzoeken en volgt wijzigingen", async ({ page }) => {
  const verzoeken = [];
  await page.route("**/besparing-*.svg", (route) => {
    verzoeken.push(new URL(route.request().url()).pathname);
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"/>' });
  });
  await page.goto("about:blank");
  await page.setContent('<style>body{margin:0}.bl-track{display:flex;overflow:auto}.bl-slide{flex:0 0 100%;height:200px}.bl-slide img{width:100%;height:200px}</style><div id="root"></div>');
  await page.evaluate(() => {
    const verbinding = new EventTarget();
    verbinding.saveData = true;
    Object.defineProperty(navigator, "connection", { configurable: true, value: verbinding });
  });
  await page.addScriptTag({ content: bundel.outputFiles[0].text });
  await expect.poll(() => verzoeken.includes("/besparing-eerste.svg")).toBe(true);
  await page.waitForTimeout(500);
  expect(verzoeken).toEqual(["/besparing-eerste.svg"]);
  await page.locator(".bl").nth(0).getByRole("button", { name: "Volgende foto" }).click();
  await expect.poll(() => verzoeken.includes("/besparing-tweede.svg")).toBe(true);
  expect(verzoeken).not.toContain("/besparing-derde.svg");
  expect(verzoeken).not.toContain("/besparing-volgende.svg");
  await page.evaluate(() => { navigator.connection.saveData = false; navigator.connection.dispatchEvent(new Event("change")); });
  await expect.poll(() => verzoeken.includes("/besparing-volgende.svg")).toBe(true);
  await expect.poll(() => verzoeken.includes("/besparing-derde.svg")).toBe(true);
});
