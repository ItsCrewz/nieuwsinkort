// Regressie #686: voorlaadintentie blijft behouden na een overgeslagen start; hook zonder DOM-bibliotheek: React-dispatcher en browserglobals zijn kleine doubles.
import assert from "node:assert/strict";
import type { Video } from "../../src/types";
import fixture from "./fixtures/voorlaadintentie-686.json";

const wacht = (ms = 20) => new Promise((ok) => setTimeout(ok, ms));
const tests: [string, () => Promise<void>][] = [];
const t = (naam: string, f: () => Promise<void>) => tests.push([naam, f]);

// --- browserdoubles ---
const g = globalThis as any;
const links: { rel: string; href: string }[] = [];
const plaatjes: string[] = [];
const abonnees: Record<string, (() => void)[]> = {};
let zichtbaar = "visible";
let klaarState = "complete";
let navVendor = "Google Inc.";
let navUa = "Mozilla/5.0 (X11; Linux x86_64)";
const fetches: string[] = [];
g.window = g;
g.location = { href: "https://nieuwsinkort.pages.dev/" };
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
g.requestIdleCallback = (f: () => void) => setTimeout(f, 0);
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
const { useVoorladen } = await import("../../src/usevoorladen");
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
const reset = () => { links.length = plaatjes.length = fetches.length = 0; zichtbaar = "visible"; klaarState = "complete"; navVendor = "Google Inc."; navUa = "Mozilla/5.0 (X11; Linux x86_64)"; for (const k in abonnees) delete abonnees[k]; };

const opTab = { closest: (q: string) => (q === "[data-video-tab]" ? {} : null) };
const intentie = (type = "pointerdown", target: unknown = opTab) => (abonnees[type] || []).slice().forEach((f) => (f as any)({ target }));
const alsVideo = (u: string) => /\/media\/dumpert\//.test(u);

t("overgeslagen intentie op videoroute blijft mogelijk na terugkeer en bij nieuwe data", async () => {
  reset();
  const h = maakHook();
  const l = { filmpjes: [], dumpert: [fixture] };
  h.render(l, "2026-03-01T10:00", true);
  intentie("focusin");
  intentie("mouseover");
  await wacht();
  assert.equal(fetches.length, 0);
  assert.equal((abonnees.mouseover || []).length, 1, "listeners blijven beschikbaar");
  h.render(l, "2026-03-01T10:00", false);
  intentie("mouseover");
  await wacht();
  assert.ok(fetches.some(alsVideo));
  const n = fetches.length;
  intentie("focusin");
  await wacht();
  assert.equal(fetches.length, n);
  assert.equal((abonnees.mouseover || []).length, 0);
  h.render(lijsten("reg686nieuw"), "2026-03-01T11:00", false);
  intentie("focusin");
  await wacht();
  assert.ok(fetches.some((u) => u.includes("reg686nieuw")));
  h.unmount();
  assert.equal((abonnees.focusin || []).length, 0);
});

t("leeg plan: een intentie zonder videowerk telt niet; met data volgt de start alsnog", async () => {
  reset();
  const h = maakHook();
  h.render({ filmpjes: [], dumpert: [] }, "2026-03-02T10:00", false);
  intentie("pointerdown");
  await wacht();
  assert.equal(fetches.length, 0);
  assert.equal((abonnees.pointerdown || []).length, 1, "listeners blijven staan");
  h.render(lijsten("leeg686"), "2026-03-02T10:00", false);
  intentie("pointerdown");
  await wacht();
  assert.ok(fetches.some(alsVideo));
  assert.equal((abonnees.pointerdown || []).length, 0);
  h.unmount();
});

for (const [naam, f] of tests) {
  await f();
  console.log("✓", naam);
}
