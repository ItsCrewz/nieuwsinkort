import { test, expect } from "@playwright/test";

const ids = {
  Nederland: "nl", Buitenland: "buitenland", Politiek: "politiek", Voetbal: "voetbal",
  "Formule 1": "f1", Auto: "auto", Sport: "sport", "Tech & AI": "tech",
  Haarlem: "haarlem", Showbizz: "showbizz", Filmpjes: "filmpjes", Dumpert: "dumpert",
};

for (const breedte of [375, 900]) test(`Rubrieken zijn met toetsenbord en muis te bedienen bij ${breedte}px`, async ({ page }) => {
  await page.setViewportSize({ width: breedte, height: 800 });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.goto("#/");
  const meer = page.getByRole("button", { name: "Meer", exact: true });
  await expect(meer.or(page.getByRole("tab", { name: "Dumpert" }))).toBeVisible();
  // Als alles past, zijn alle rubrieken rechtstreeks bereikbaar en is er geen menu.
  if (!(await meer.count())) {
    expect(breedte).toBe(900);
    await expect(page.getByRole("tab", { name: "Dumpert" })).toBeVisible();
    return;
  }
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
  await expect(opties.first()).toBeVisible();
  const naam = (await opties.first().textContent()).trim();
  expect(ids[naam]).toBeTruthy();
  await opties.first().press("Enter");
  await expect(page.locator(`#rubriek-tab-${ids[naam]}`)).toBeFocused();
  await expect(page.locator(`#rubriek-tab-${ids[naam]}`)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await meer.click();
  const muisoptie = page.getByRole("menuitem").first();
  const muisnaam = (await muisoptie.textContent()).trim();
  expect(ids[muisnaam]).toBeTruthy();
  await muisoptie.click();
  await expect(page.locator(`#rubriek-tab-${ids[muisnaam]}`)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("Meer blijft met aanraking te openen en een rubriek te kiezen", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "Deze proef vereist aanraakondersteuning.");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.goto("#/");
  const meer = page.getByRole("button", { name: "Meer", exact: true });
  await expect(meer).toBeVisible();
  const scroll = await page.evaluate(() => window.scrollY);
  await meer.tap();
  const optie = page.getByRole("menuitem").first();
  await expect(optie).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  const naam = (await optie.textContent()).trim();
  expect(ids[naam]).toBeTruthy();
  await optie.tap();
  await expect(page.locator(`#rubriek-tab-${ids[naam]}`)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("menu")).toHaveCount(0);
});
