// useVoorladen: aan/uit-voorwaarden van de hook, zonder DOM-bibliotheek: React-dispatcher en browserglobals zijn kleine doubles.
import assert from "node:assert/strict";
import type { Video } from "../src/types";

const wacht = (ms = 20) => new Promise((ok) => setTimeout(ok, ms));
const tests: [string, () => Promise<void>][] = [];
const t = (naam: string, f: () => Promise<void>) => tests.push([naam, f]);

// --- browserdoubles ---
const g = globalThis as any;
const links: { rel: string; href: string }[] = [];
const plaatjes: string[] = [];
const abonnees: Record<string, (() => void)[]> = {};
let idleAanroepen = 0;
let zichtbaar = "visible";
let klaarState = "complete";
let navVendor = "Google Inc.";
let navUa = "Mozilla/5.0 (X11; Linux x86_64)";
const fetches: string[] = [];
g.window = g;
g.location = { href: "https://nieuwsinkort.pages.dev/" };
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
g.requestIdleCallback = (f: () => void) => (idleAanroepen++, setTimeout(f, 0));
g.document = {
  get readyState() { return klaarState; },
  get visibilityState() { return zichtbaar; },
  head: { appendChild: (l: { rel: string; href: string }) => links.push(l) },
  createElement: () => ({ setAttribute() {}, style: {} }),
  addEventListener: (n: string, f: () => void) => (abonnees[n] ||= []).push(f),
  removeEventListener: (n: string, f: () => void) => (abonnees[n] = (abonnees[n] || []).filter((x) => x !== f)),
};
g.addEventListener = g.document.addEventListener;
g.removeEventListener = g.document.removeEventListener;
Object.defineProperty(g, "navigator", { configurable: true, get: () => ({ vendor: navVendor, userAgent: navUa }) });
g.Image = class {
  onload: () => void = () => {};
  set src(s: string) { plaatjes.push(s); queueMicrotask(() => this.onload()); }
};
g.fetch = async (u: string) => (fetches.push(String(u)), new Response("", { status: 404 }));

// dynamisch: video.tsx leest window bij het laden, dus pas importeren na het opzetten van de globals
const { useVoorladen } = await import("../src/usevoorladen");
const React: any = (await import("react")).default;

// --- minimale hook-runner (React 18-dispatcher met alleen useRef en useEffect) ---
type Args = Parameters<typeof useVoorladen>;
function maakHook() {
  const refs: { current: unknown }[] = [];
  const effecten: { deps?: unknown[]; weg?: void | (() => void) }[] = [];
  const intern = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  return {
    render(...a: Args) {
      let r = 0, e = 0;
      const wacht: (() => void)[] = [];
      intern.current = {
        useRef: (v: unknown) => (refs[r] ||= { current: v }, refs[r++]),
        useEffect: (f: () => void | (() => void), deps?: unknown[]) => {
          const prev = effecten[e] || (effecten[e] = {});
          e++;
          if (prev.deps && deps && deps.every((d, i) => Object.is(d, prev.deps![i]))) return;
          wacht.push(() => { if (typeof prev.weg === "function") prev.weg(); prev.deps = deps; prev.weg = f(); });
        },
      };
      try { useVoorladen(...a); } finally { intern.current = null; }
      wacht.forEach((f) => f());
    },
    unmount() { effecten.forEach((x) => typeof x.weg === "function" && x.weg()); },
  };
}

const vid = (id: string, embed: string, soort?: Video["soort"]): Video =>
  ({ titel: id, ai: "", bron: "x", href: `https://x.nl/${id}`, embed, thumb: `https://img.example/${id}.jpg`, populariteit: "", tijd: "", soort });
const lijsten = (p: string) => ({
  filmpjes: [vid(`${p}f0`, `https://cdn.example/${p}f0.mp4`, "short"), vid(`${p}j0`, `https://www.youtube.com/embed/${p}jjjjjjj`, "journaal")],
  dumpert: [vid(`${p}d0`, `https://media.dumpert.nl/v/${p}/index.m3u8`)],
});
const reset = () => { links.length = plaatjes.length = fetches.length = 0; idleAanroepen = 0; zichtbaar = "visible"; klaarState = "complete"; navVendor = "Google Inc."; navUa = "Mozilla/5.0 (X11; Linux x86_64)"; for (const k in abonnees) delete abonnees[k]; };

const opTab = { closest: (q: string) => (q === "[data-video-tab]" ? {} : null) };
const intentie = (type = "pointerdown", target: unknown = opTab) => (abonnees[type] || []).slice().forEach((f) => (f as any)({ target }));
const alsVideo = (u: string) => /\/media\/dumpert\//.test(u);

t("laadt vooraf: thumbs van de startsoort (short) en Dumpert, en preconnect", async () => {
  reset();
  const h = maakHook();
  h.render(lijsten("a"), "2026-01-01T10:00", false);
  await wacht();
  intentie();
  await wacht();
  assert.ok(plaatjes.includes("https://img.example/af0.jpg"));
  assert.ok(plaatjes.includes("https://img.example/ad0.jpg"));
  assert.ok(!plaatjes.includes("https://img.example/aj0.jpg"), "journaal hoort niet bij de startsoort");
  assert.ok(links.some((l) => l.rel === "preconnect" && l.href === "https://cdn.example"));
  h.unmount();
});
t("niets zolang de lijsten (vids) ontbreken", async () => {
  reset();
  const h = maakHook();
  h.render(null, "2026-01-02T10:00", false);
  await wacht();
  assert.equal(idleAanroepen, 0);
  assert.equal(plaatjes.length, 0);
  h.unmount();
});
t("niets zonder gegenereerd", async () => {
  reset();
  const h = maakHook();
  h.render(lijsten("b"), undefined, false);
  await wacht();
  assert.equal(idleAanroepen, 0);
  assert.equal(plaatjes.length, 0);
  h.unmount();
});
t("niets als je al op een video-route zit", async () => {
  reset();
  const h = maakHook();
  h.render(lijsten("c"), "2026-01-03T10:00", true);
  await wacht();
  assert.equal(plaatjes.length, 0);
  h.unmount();
});
t("route wordt pas bij het idle-moment bekeken (via ref)", async () => {
  reset();
  const h = maakHook();
  const l = lijsten("d");
  h.render(l, "2026-01-04T10:00", false);
  h.render(l, "2026-01-04T10:00", true); // gebruiker gaat nog voor idle naar een videoroute
  await wacht();
  assert.equal(plaatjes.length, 0);
  h.unmount();
});
t("één keer per sessie: zelfde gegenereerd opnieuw doet niets, nieuwe wel", async () => {
  reset();
  const h = maakHook();
  const l = lijsten("e");
  h.render(l, "2026-01-05T10:00", false);
  await wacht();
  const n = plaatjes.length;
  assert.ok(n > 0);
  // nieuwe hook-instantie (bv. remount) met dezelfde gegenereerd
  const h2 = maakHook();
  h2.render(l, "2026-01-05T10:00", false);
  await wacht();
  assert.equal(idleAanroepen, 1);
  assert.equal(plaatjes.length, n);
  h2.render(lijsten("e2"), "2026-01-05T11:00", false);
  await wacht();
  assert.ok(plaatjes.includes("https://img.example/e2f0.jpg"));
  h.unmount(); h2.unmount();
});
t("onzichtbaar tabblad: wacht tot het zichtbaar wordt", async () => {
  reset();
  zichtbaar = "hidden";
  const h = maakHook();
  h.render(lijsten("f"), "2026-01-06T10:00", false);
  await wacht();
  assert.equal(plaatjes.length, 0);
  zichtbaar = "visible";
  (abonnees.visibilitychange || []).slice().forEach((f) => f());
  await wacht();
  assert.ok(plaatjes.includes("https://img.example/ff0.jpg"));
  h.unmount();
});
t("voor `load`: wacht op het load-event", async () => {
  reset();
  klaarState = "loading";
  const h = maakHook();
  h.render(lijsten("g"), "2026-01-07T10:00", false);
  await wacht();
  assert.equal(plaatjes.length, 0);
  (abonnees.load || []).slice().forEach((f) => f());
  await wacht();
  assert.ok(plaatjes.length > 0);
  h.unmount();
});
t("unmount vóór idle annuleert het voorladen", async () => {
  reset();
  const h = maakHook();
  h.render(lijsten("h"), "2026-01-08T10:00", false);
  h.unmount();
  await wacht();
  assert.equal(plaatjes.length, 0);
});
t("mobiele data en Save-Data veranderen niets (sinds #142)", async () => {
  reset();
  const verbinding = { effectiveType: "2g", saveData: true, type: "cellular" };
  const bewaard = Object.getOwnPropertyDescriptor(g, "navigator")!;
  Object.defineProperty(g, "navigator", { configurable: true, get: () => ({ vendor: navVendor, userAgent: navUa, connection: verbinding }) });
  const h = maakHook();
  h.render(lijsten("i"), "2026-01-09T10:00", false);
  await wacht();
  intentie();
  await wacht();
  assert.ok(plaatjes.includes("https://img.example/if0.jpg"));
  assert.ok(plaatjes.includes("https://img.example/id0.jpg"));
  assert.ok(fetches.some((u) => u.includes("/media/dumpert/")), "HLS via de proxy ook op mobiele data");
  Object.defineProperty(g, "navigator", bewaard);
  h.unmount();
});
t("Safari/iOS: preconnect rechtstreeks naar de videobron", async () => {
  reset();
  navVendor = "Apple Computer, Inc.";
  const h = maakHook();
  h.render(lijsten("j"), "2026-01-10T10:00", false);
  await wacht();
  intentie();
  await wacht();
  assert.ok(links.some((l) => l.href === "https://media.dumpert.nl"));
  h.unmount();
});

t("Home: zonder intentie alleen thumbs, geen hls-chunk, fetch of preconnect", async () => {
  reset();
  const h = maakHook();
  h.render(lijsten("n"), "2026-02-01T10:00", false);
  await wacht();
  assert.ok(plaatjes.includes("https://img.example/nf0.jpg"));
  assert.equal(fetches.length, 0);
  assert.equal(links.length, 0);
  h.unmount();
});
t("Dumpert-thumb gaat via /media/dumpert; niet-Dumpert onveranderd", async () => {
  reset();
  const h = maakHook();
  const l = lijsten("o");
  l.dumpert[0].thumb = "https://media.dumpert.nl/dmp/media/video/ab/poster-small.jpg";
  h.render(l, "2026-02-02T10:00", false);
  await wacht();
  assert.ok(plaatjes.includes("/media/dumpert/dmp/media/video/ab/poster-small.jpg"));
  assert.ok(plaatjes.includes("https://img.example/of0.jpg"));
  assert.ok(!plaatjes.some((u) => u.includes("media.dumpert.nl")));
  h.unmount();
});
t("intentie op een andere plek dan de video-tab doet niets; op de tab wel (eenmalig)", async () => {
  reset();
  const h = maakHook();
  h.render(lijsten("p"), "2026-02-03T10:00", false);
  await wacht();
  intentie("pointerdown", { closest: () => null });
  await wacht();
  assert.equal(fetches.length, 0);
  intentie("touchstart");
  await wacht();
  assert.ok(fetches.some(alsVideo), "hls via de proxy na intentie");
  const n = fetches.length;
  intentie("pointerdown");
  await wacht();
  assert.equal(fetches.length, n, "listeners zijn na de eerste intentie weg");
  h.unmount();
});
t("intentie vóór idle: ook dan video-plan, daarna geen dubbel werk", async () => {
  reset();
  klaarState = "loading";
  const h = maakHook();
  h.render(lijsten("q"), "2026-02-04T10:00", false);
  intentie("focusin");
  await wacht();
  assert.ok(fetches.some(alsVideo));
  h.unmount();
});
t("intentie op een video-route start niets; unmount ruimt listeners op", async () => {
  reset();
  const h = maakHook();
  h.render(lijsten("r"), "2026-02-05T10:00", true);
  intentie();
  await wacht();
  assert.equal(fetches.length, 0);
  h.unmount();
  assert.equal((abonnees.pointerdown || []).length, 0);
});

for (const [naam, f] of tests) {
  await f();
  console.log("✓", naam);
}
