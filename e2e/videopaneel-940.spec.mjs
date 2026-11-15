import { test, expect } from "@playwright/test";

test("filmpjespaneel verwijst naar het gekozen tabblad", async ({ page }) => {
  await page.goto("/#/filmpjes");
  const tabs = page.getByRole("tab");
  const n = await tabs.count();
  test.skip(n < 2, "geen tablijst in deze data");
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    const id = await tabs.nth(i).getAttribute("id");
    expect(id).toMatch(/^video-tab-/);
    await expect(page.locator("#video-paneel")).toHaveAttribute("aria-labelledby", id);
    await expect(page.locator("#video-paneel")).toHaveAttribute("role", "tabpanel");
  }
});

test("Dumpert heeft geen los tabpanel", async ({ page }) => {
  await page.goto("/#/dumpert");
  await expect(page.locator("#video-paneel")).toBeAttached();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.locator("#video-paneel[role=tabpanel]")).toHaveCount(0);
});
