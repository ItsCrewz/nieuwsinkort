// Meet de videofeed per swipe (#254), buiten npm test: Chrome met iPhone-emulatie, echte touch-swipes via CDP.
// Per swipe: tijd van eerste touchmove tot actief, play(), playing, eerste nieuw gepresenteerd frame (rVFC) en poster weg,
// plus layout shift (PerformanceObserver) en de zichtbare beeldrechthoek van poster en video (beeldsprong in px).
//
// Gebruik: PW=/pad/naar/playwright-core/index.mjs node scripts/meet-swipe.mjs http://127.0.0.1:4173/ dumpert 6 uit.json
// BEWAAR_DATA=pad bewaart de publieke feed; DATA=pad hergebruikt die voor een vergelijkbare nameting.
// Alleen lokale preview: /data.json en de Dumpert-proxy komen van productie; geen AI of /samenvatting.
import { readFileSync, writeFileSync } from "node:fs";

const [BASE = "http://localhost:4173/", CAT = "dumpert", N = "6", UIT] = process.argv.slice(2);
const LIVE = "https://nieuwsinkort.nl";
const url = new URL(BASE);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol)) throw new Error("gebruik een lokale Vite-preview");
if (!["dumpert", "filmpjes"].includes(CAT) || !Number.isInteger(+N) || +N < 5) throw new Error("gebruik dumpert of filmpjes en minstens 5 swipes");
const { chromium } = await import(process.env.PW || "playwright-core");
const response = process.env.DATA ? null : await fetch(`${LIVE}/data.json`, { signal: AbortSignal.timeout(30000) });
if (response && !response.ok) throw new Error(`data.json: HTTP ${response.status}`);
const ruw = process.env.DATA ? JSON.parse(readFileSync(process.env.DATA, "utf8")) : await response.json();
if (process.env.BEWAAR_DATA) writeFileSync(process.env.BEWAAR_DATA, JSON.stringify(ruw, null, 2));
const native = (v) => /\.(m3u8|mp4)(\?|$)/i.test(v.embed || "") && !/youtu/.test(v.embed || "");
ruw[CAT] = ruw[CAT].filter(native);
const lijst = CAT === "dumpert" ? ruw.dumpert : ruw.filmpjes;
const slug = (v) => { let m; if ((m = /dumpert\.nl\/item\/([\w-]+)/.exec(v.href))) return "d-" + m[1]; if ((m = /\/status\/(\d+)/.exec(v.href))) return "x-" + m[1]; if ((m = /instagram\.com\/(?:reel|p)\/([\w-]+)/.exec(v.href))) return "ig-" + m[1]; if ((m = /reddit\.com\/r\/[\w-]+\/comments\/(\w+)/.exec(v.href))) return "r-" + m[1]; return null; };
const eerste = lijst[0];
if (lijst.length < 2 || !slug(eerste)) throw new Error("minstens twee native video's en een herkenbare eerste link nodig in " + CAT);

const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1" };
const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
try {
const ctx = await b.newContext(iphone);
await ctx.route(/\/data\.json(\?|$)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ruw), headers: { "cache-control": "no-store" } }));
await ctx.route(/\/media\/dumpert(?:-proxy)?(?:\/|\?|$)/, async (r) => { const u = new URL(r.request().url()); await r.fulfill({ response: await r.fetch({ url: LIVE + u.pathname + u.search }) }); });
await ctx.route(/\/(samenvatting|meer)(\?|$)/, (r) => r.abort());

// In de pagina: tijdlijn van gebaren, play()-aanroepen, media-events, poster-klasse en actieve slide.
await ctx.addInitScript(() => {
  const m = (window.__meet = { log: [], shifts: [] });
  const nu = () => performance.now();
  const plek = (el) => { const s = el.closest?.(".fslide"); return s ? Number(s.dataset.i) : -1; };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { m.log.push({ t: nu(), ev: "play()", i: plek(this) }); return play.call(this); };
  for (const ev of ["touchstart", "touchmove", "touchend", "touchcancel"]) window.addEventListener(ev, () => m.log.push({ t: nu(), ev, i: -1 }), { capture: true, passive: true });
  for (const ev of ["playing", "loadeddata", "canplay", "waiting", "pause"]) document.addEventListener(ev, (e) => m.log.push({ t: nu(), ev, i: plek(e.target) }), true);
  if (PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) new PerformanceObserver((l) => { for (const e of l.getEntries()) m.shifts.push({ t: e.startTime, v: e.value, input: e.hadRecentInput }); }).observe({ type: "layout-shift", buffered: true });
  else m.shifts = null;
  new MutationObserver((rs) => { for (const r of rs) {
    const el = r.target;
    if (el.classList?.contains("f-poster")) m.log.push({ t: nu(), ev: el.classList.contains("weg") ? "poster-weg" : "poster-terug", i: plek(el) });
    if (r.attributeName === "aria-current" && el.getAttribute("aria-current") === "true") m.log.push({ t: nu(), ev: "actief", i: Number(el.dataset.i) });
  } }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class", "aria-current"] });
});

const p = await ctx.newPage();
const fouten = [];
p.on("pageerror", (e) => fouten.push(e.message));
const startUrl = new URL(BASE);
startUrl.searchParams.set("debug", "1");
startUrl.hash = `/${CAT}/${encodeURIComponent(slug(eerste))}`;
async function start() {
  await p.goto("about:blank");
  await p.goto(startUrl.href);
  await p.waitForSelector('.fslide[aria-current="true"]');
  await p.waitForTimeout(5000);
}
await start();
const cdp = await ctx.newCDPSession(p);

// Zichtbare inhoud van poster/video (object-fit + intrinsieke maat), geknipt op de slide.
const staat = (doel) => p.evaluate((doel) => {
  const s = document.querySelector(`.fslide[data-i="${doel}"]`);
  if (!s) return null;
  const vd = s.querySelector("video"), img = s.querySelector("img.f-poster"), col = s.querySelector(".fcol").getBoundingClientRect();
  const inhoud = (el, w, h) => {
    if (!el) return null;
    const r = el.getBoundingClientRect(), fit = getComputedStyle(el).objectFit;
    let x = r.left, y = r.top, bw = r.width, bh = r.height;
    if (w > 0 && h > 0 && fit !== "fill") {
      const k = fit === "cover" ? Math.max(r.width / w, r.height / h) : Math.min(r.width / w, r.height / h);
      bw = w * k; bh = h * k; x = r.left + (r.width - bw) / 2; y = r.top + (r.height - bh) / 2;
    }
    const l = Math.max(x, col.left, r.left), t = Math.max(y, col.top, r.top), rr = Math.min(x + bw, col.right, r.right), bb = Math.min(y + bh, col.bottom, r.bottom);
    return { x: Math.round(l - col.left), y: Math.round(t - col.top), w: Math.max(0, Math.round(rr - l)), h: Math.max(0, Math.round(bb - t)), box: [Math.round(r.left - col.left), Math.round(r.top - col.top), Math.round(r.width), Math.round(r.height)], fit };
  };
  return { t: performance.now(), video: vd ? { ...inhoud(vd, vd.videoWidth, vd.videoHeight), rs: vd.readyState, paused: vd.paused, currentTime: vd.currentTime, src: !!vd.getAttribute("src") || vd.dataset.mse === "1", vw: vd.videoWidth, vh: vd.videoHeight, mse: vd.dataset.mse === "1" } : null,
    poster: img ? { ...inhoud(img, img.naturalWidth, img.naturalHeight), nw: img.naturalWidth, nh: img.naturalHeight, weg: img.classList.contains("weg") || getComputedStyle(img).visibility === "hidden" || getComputedStyle(img).opacity === "0" } : null };
}, doel);

// Eerste gepresenteerde frames van de doelvideo na de swipe (rVFC; mediaTime om bewegen te zien).
const volgFrames = (doel) => p.evaluate((doel) => {
  const vd = document.querySelector(`.fslide[data-i="${doel}"] video`);
  window.__frames = [];
  if (!vd?.requestVideoFrameCallback) return false;
  const cb = (t, meta) => { window.__frames.push({ t: performance.now(), callbackTijd: t, verwachtePresentatie: meta.expectedDisplayTime, mt: meta.mediaTime, n: meta.presentedFrames, i: Number(vd.closest(".fslide")?.dataset.i ?? -1) }); if (window.__frames.length < 120) window.__frameId = vd.requestVideoFrameCallback(cb); };
  window.__frameVideo = vd;
  window.__frameId = vd.requestVideoFrameCallback(cb);
  return true;
}, doel);

async function swipe() {
  const x = 195, y0 = 700, y1 = 160, stappen = 12;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let k = 1; k <= stappen; k++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * k) / stappen }] });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

// Een afgebroken sleep moet de oorspronkelijke speler hervatten en de buur pauzeren.
await p.waitForTimeout(2500);
const afgebrokenVan = await p.evaluate(() => Number(document.querySelector('.fslide[aria-current="true"]')?.dataset.i));
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 700 }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 650 }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 695 }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await p.waitForTimeout(2000);
const afgebroken = await p.evaluate((van) => ({
  actief: Number(document.querySelector('.fslide[aria-current="true"]')?.dataset.i),
  huidigGepauzeerd: document.querySelector(`.fslide[data-i="${van}"] video`)?.paused,
  volgendGepauzeerd: document.querySelector(`.fslide[data-i="${van + 1}"] video`)?.paused,
}), afgebrokenVan);
console.log("afgebroken swipe:", afgebroken);
if (afgebroken.actief !== afgebrokenVan || afgebroken.huidigGepauzeerd !== false || afgebroken.volgendGepauzeerd !== true) throw new Error("herstel van afgebroken swipe mislukt");

const rijen = [];
let geslaagd = 0, ronde = 1;
for (let poging = 1; geslaagd < +N && poging <= +N * 3; poging++) {
  const a = await p.evaluate(() => Number(document.querySelector('.fslide[aria-current="true"]')?.dataset.i));
  const doel = a + 1;
  if (doel >= lijst.length) {
    ronde++;
    await start();
    continue;
  }
  await p.waitForTimeout(2500); // voorladen van de volgende de tijd geven (zoals kijken)
  const voor = await staat(doel);
  const rvfc = await volgFrames(doel);
  const begin = await p.evaluate(() => { window.__meet.log = []; if (window.__meet.shifts) window.__meet.shifts = []; return { t: performance.now(), timeOrigin: performance.timeOrigin }; });
  await swipe();
  await p.waitForTimeout(3000);
  const na = await staat(doel);
  const { metingen, log, shifts, frames, actiefNa, einde } = await p.evaluate(() => {
    window.__frameVideo?.cancelVideoFrameCallback?.(window.__frameId);
    return { metingen: window.__swipeMetingen || [], log: window.__meet.log, shifts: window.__meet.shifts, frames: window.__frames, actiefNa: Number(document.querySelector('.fslide[aria-current="true"]')?.dataset.i), einde: performance.now() };
  });
  const t0 = log.find((e) => e.ev === "touchmove")?.t ?? log.find((e) => e.ev === "touchend")?.t;
  const eerst = (ev, i = doel) => { const e = log.find((x) => x.ev === ev && x.i === i); return e && t0 != null ? Math.round(e.t - t0) : null; };
  const f = frames.find((x) => t0 != null && x.t >= t0 && x.i === doel);
  const bewegend = frames.find((x) => t0 != null && x.t >= t0 && x.i === doel && voor?.video && x.mt > voor.video.currentTime + 0.001);
  const fTijd = f ? Math.round(f.t - t0) : null;
  const pw = voor?.poster?.weg ? 0 : eerst("poster-weg");
  const gelukt = t0 != null && actiefNa === doel && !!na?.video?.src;
  if (gelukt) geslaagd++;
  const verschuivingen = shifts?.filter((s) => s.t >= begin.t && s.t <= einde) ?? null;
  const sprong = (r1, r2) => r1 && r2 && r1.w > 0 && r2.w > 0 && r1.h > 0 && r2.h > 0 ? Math.max(Math.abs(r1.x - r2.x), Math.abs(r1.y - r2.y), Math.abs(r1.w - r2.w), Math.abs(r1.h - r2.h)) : null;
  const rij = {
    poging, ronde, geslaagd: gelukt, van: a, naar: doel, actiefNa, bron: lijst[doel]?.bron,
    tijd: { timeOrigin: begin.timeOrigin, begin: begin.t, eersteTouchmove: t0 ?? null, einde },
    msNaEersteTouchmove: { actief: eerst("actief"), play: eerst("play()"), playing: eerst("playing"), frame: fTijd,
      bewegendFrame: bewegend ? Math.round(bewegend.t - t0) : null, posterWeg: pw },
    rvfc, voor, na, posterVideoVerschilPx: sprong(voor?.poster, na?.video),
    layoutShiftSom: verschuivingen ? +verschuivingen.reduce((s, e) => s + e.v, 0).toFixed(6) : null,
    layoutShiftZonderRecenteInput: verschuivingen ? +verschuivingen.filter((e) => !e.input).reduce((s, e) => s + e.v, 0).toFixed(6) : null,
    metingen, log, shifts: verschuivingen, frames,
  };
  rijen.push(rij);
  console.log(JSON.stringify({ poging, ronde, gelukt, van: a, naar: doel, bron: rij.bron, msNaEersteTouchmove: rij.msNaEersteTouchmove, layoutShiftSom: rij.layoutShiftSom, posterVideoVerschilPx: rij.posterVideoVerschilPx }));
  if (process.env.LOG) console.log(log.map((e) => `${Math.round(e.t - t0)} ${e.ev} ${e.i}`).join(" | "));
}
const dbg = await p.evaluate(() => document.querySelector('[data-testid="video-debug"]')?.innerText?.split("Events:")[0].split("\n").slice(0, 3).join(" / "));
console.log("geslaagd:", geslaagd, "debug:", dbg, "pageerrors:", fouten.length, fouten.slice(0, 2));
if (UIT) writeFileSync(UIT, JSON.stringify({ base: BASE, cat: CAT, wanneer: new Date().toISOString(), browser: b.version(), iphone, feedItems: lijst.length, gevraagdeSwipes: +N, geslaagd, fouten, rijen }, null, 2));
if (geslaagd < +N) process.exitCode = 1;
} finally {
await b.close();
}
