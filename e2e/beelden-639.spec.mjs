import { test, expect } from "@playwright/test";
import { build } from "esbuild";

const bundel = await build({ entryPoints: ["e2e/fixtures/beelden-639.tsx"], bundle: true, format: "iife", write: false });

async function open(page, multi) {
  await page.goto(`about:blank${multi ? "#meer" : ""}`);
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundel.outputFiles[0].text });
  await expect(page.locator(".bl img").first()).toBeVisible();
}

test("één decoratief beeld heeft geen bediening of tabstop", async ({ page }) => {
  await open(page, false);
  await expect(page.getByRole("group", { name: "Foto's" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /foto/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Voor" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Na" })).toBeFocused();
});

for (const focus of ["track", "knop"]) test(`meerdere beelden en laadfout met focus op ${focus}`, async ({ page }) => {
  await open(page, true);
  const track = page.getByRole("group", { name: "Foto's" });
  await page.getByRole("button", { name: "Voor" }).focus();
  await page.keyboard.press("Tab");
  await expect(track).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Vorige foto" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Volgende foto" })).toBeFocused();
  if (focus === "track") await track.focus();
  await page.locator(".bl img").last().evaluate((img) => img.dispatchEvent(new Event("error")));
  await expect(page.locator(".bl-track")).toBeFocused();
  await expect(page.getByRole("group", { name: "Foto's" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /foto/i })).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Na" })).toBeFocused();
});
