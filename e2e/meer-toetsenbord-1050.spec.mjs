import { test, expect } from "@playwright/test";

for (const breedte of [375, 900]) test(`Meer is met toetsenbord en muis te bedienen bij ${breedte}px`, async ({ page }) => {
  await page.setViewportSize({ width: breedte, height: 800 });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.goto("#/");
  const meer = page.getByRole("button", { name: "Meer", exact: true });
  await expect(meer).toBeVisible();
  await meer.focus();
  await page.keyboard.press("Enter");
  const opties = page.getByRole("menuitem");
  await expect(opties.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(opties.last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(opties.first()).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(opties.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(opties.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(meer).toBeFocused();
  await meer.click();
  const naam = await opties.last().textContent();
  await opties.last().press("Enter");
  await expect(page.getByRole("tab", { selected: true })).toBeFocused();
  await expect(page.getByRole("tab", { selected: true })).toHaveText(naam.trim());
  await expect(page.getByRole("menu")).toHaveCount(0);
});
