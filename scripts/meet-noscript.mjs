// Meting #313: `node scripts/meet-noscript.mjs <basis-url> [iphone]`
// 1) JavaScript uit: aantal koppen met link in <noscript> (verwacht ≥10). 2) JavaScript aan: CLS, console-/paginafouten, <noscript> niet zichtbaar.
import { chromium, devices } from "@playwright/test";

const basis = process.argv[2] || "http://127.0.0.1:8788";
const opties = process.argv[3] === "iphone" ? devices["iPhone 15"] : {};
const browser = await chromium.launch();

const zonder = await browser.newContext({ ...opties, javaScriptEnabled: false });
const p0 = await zonder.newPage();
await p0.goto(basis + "/", { waitUntil: "load" });
const koppen = await p0.locator("main ul li").count();
const links = await p0.locator("main ul li a[href^='http']").count();
const h1 = await p0.locator("main h1").isVisible();
const samenvatting = await p0.locator("main h2", { hasText: "In het kort" }).count();

const met = await browser.newContext(opties);
const p1 = await met.newPage();
const fouten = [];
p1.on("pageerror", (e) => fouten.push(String(e)));
p1.on("console", (m) => { if (m.type() === "error") fouten.push(m.text()); });
await p1.addInitScript(() => {
  window.__cls = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
});
await p1.goto(basis + "/", { waitUntil: "networkidle" });
await p1.waitForTimeout(3000);
const cls = await p1.evaluate(() => window.__cls);
const noscriptZichtbaar = await p1.locator("noscript main").count();
await browser.close();
console.log(JSON.stringify({ basis, apparaat: opties.userAgent ? "iPhone 15" : "desktop", zonderJs: { koppen, bronlinks: links, h1, samenvatting }, metJs: { cls: +cls.toFixed(4), noscriptZichtbaar, fouten } }));
const ok = koppen >= 10 && links >= 10 && h1 && cls <= 0.01 && !fouten.length && !noscriptZichtbaar;
process.exit(ok ? 0 : 1);
