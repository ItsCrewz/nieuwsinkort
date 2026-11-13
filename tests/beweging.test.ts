// Beweging (#536): de enige reduced-motion-check, animeer/metOvergang en de CSS-tokens. Draai: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHash } from "../src/route";
import { DUUR, animeer, kanOvergang, metOvergang, rustig, scrollGedrag } from "../src/beweging";

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", name); };

type G = Record<string, unknown>;
const g = globalThis as unknown as G;
const zetWindow = (matchMedia: unknown) => { g.window = { matchMedia }; };
const mq = (reduce: boolean) => (q: string) => ({ matches: reduce && q.includes("prefers-reduced-motion") });
const css = readFileSync("src/index.css", "utf8");
// Transities/animaties/keyframes staan in het uitgestelde bestand (css-kritiek); layout, intro (kaart-in) en reduced motion in index.css.
const uitgesteld = readFileSync("src/uitgesteld.css", "utf8");
const alles = css + "\n" + uitgesteld;

await t("rustig/scrollGedrag volgen prefers-reduced-motion", () => {
  zetWindow(mq(true));
  assert.equal(rustig(), true);
  assert.equal(scrollGedrag(), "auto");
  zetWindow(mq(false));
  assert.equal(rustig(), false);
  assert.equal(scrollGedrag(), "smooth");
});

await t("rustig zonder window.matchMedia (en zonder window) is false", () => {
  zetWindow(undefined);
  assert.equal(rustig(), false);
  delete g.window;
  assert.equal(rustig(), false);
});

await t("animeer: no-op bij reduced motion, zonder el.animate en in een verborgen tab", () => {
  let aanroepen = 0;
  const el = { animate: () => { aanroepen++; return { cancel() {}, addEventListener() {} }; } } as unknown as Element;
  g.document = { hidden: false };
  zetWindow(mq(true));
  assert.equal(animeer(el, [{ opacity: 0 }, { opacity: 1 }]), null);
  zetWindow(mq(false));
  assert.equal(animeer({} as Element, [{ opacity: 0 }]), null);
  g.document = { hidden: true };
  assert.equal(animeer(el, [{ opacity: 0 }]), null);
  assert.equal(aanroepen, 0);
});

await t("animeer: annuleert een lopende animatie op hetzelfde element en gebruikt DUUR[3]", () => {
  zetWindow(mq(false));
  g.document = { hidden: false };
  const gemaakt: { cancelled: boolean; opt: KeyframeAnimationOptions }[] = [];
  const el = { animate: (_f: unknown, opt: KeyframeAnimationOptions) => { const a = { cancelled: false, opt, cancel() { this.cancelled = true; }, addEventListener() {} }; gemaakt.push(a); return a; } } as unknown as Element;
  animeer(el, [{ opacity: 0 }, { opacity: 1 }]);
  animeer(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 99 });
  assert.equal(gemaakt[0].cancelled, true);
  assert.equal(gemaakt[1].cancelled, false);
  assert.equal(gemaakt[0].opt.duration, DUUR[3]);
  assert.equal(gemaakt[1].opt.duration, 99);
});

await t("kanOvergang: alleen artikel openen en sluiten met beschikbare API", () => {
  const lijst = parseHash("#/");
  const artikel = parseHash("#/bericht/test");
  const doc: G = { hidden: false, startViewTransition() {} };
  g.document = doc;
  zetWindow(mq(false));
  assert.equal(kanOvergang(lijst, artikel), true);
  assert.equal(kanOvergang(artikel, lijst), true);
  assert.equal(kanOvergang(null, artikel), false);
  assert.equal(kanOvergang(lijst, parseHash("#/tech")), false);
  for (const hash of ["#/filmpjes", "#/filmpjes/video", "#/dumpert", "#/dumpert/video"]) {
    assert.equal(kanOvergang(parseHash(hash), artikel), false);
    assert.equal(kanOvergang(artikel, parseHash(hash)), false);
  }
  assert.equal(kanOvergang(artikel, lijst, true), false);
  zetWindow(mq(true));
  assert.equal(kanOvergang(lijst, artikel), false);
  zetWindow(mq(false));
  delete doc.startViewTransition;
  assert.equal(kanOvergang(lijst, artikel), false);
});

await t("metOvergang: met startViewTransition, zonder, en bij reduced motion", async () => {
  const log: string[] = [];
  const dataset: Record<string, string> = {};
  const doc: G = { hidden: false, documentElement: { dataset } };
  g.document = doc;
  zetWindow(mq(false));
  doc.startViewTransition = (cb: () => void) => { log.push("vt:" + dataset.overgang); cb(); return { finished: Promise.resolve() }; };
  await metOvergang(() => { log.push("update"); }, "open");
  assert.deepEqual(log, ["vt:open", "update"]);
  assert.equal(dataset.overgang, undefined);
  log.length = 0;
  await metOvergang(() => { log.push("update"); }, "thema");
  assert.deepEqual(log, ["vt:thema", "update"]);
  assert.equal(dataset.overgang, undefined);
  log.length = 0;
  delete doc.startViewTransition;
  await metOvergang(() => { log.push("update"); });
  assert.deepEqual(log, ["update"]);
  log.length = 0;
  doc.startViewTransition = () => { log.push("vt"); return { finished: Promise.resolve() }; };
  zetWindow(mq(true));
  await metOvergang(() => { log.push("update"); });
  assert.deepEqual(log, ["update"]);
});

await t("micro-interacties (#539): geen width-transitie in dots, hover alleen binnen (hover:hover), één :active-schaal", () => {
  assert.ok(!/\.bl-dots[^{]*\{[^}]*transition:[^}]*width/.test(alles));
  assert.ok(/\.bl-dots span\{[^}]*width:16px[^}]*scaleX\(\.375\)/.test(css));
  for (const k of [".btn", ".iconbtn", ".srcbtn", ".chip", ".textbtn", ".f-btn", ".nf-btn", ".back"]) assert.ok(!new RegExp(`(^|\\n)\\${k}:hover`).test(css), `${k}:hover moet binnen (hover:hover)`);
  assert.ok(/\.btn:active,[^{]*\{transform:scale\(\.97\)/.test(uitgesteld));
  assert.ok(!/:active\{transform:scale\(\.(98|96|94|92)\)/.test(alles));
});

await t("CSS-tokens --dur-1..4 zijn gelijk aan DUUR", () => {
  for (const k of [1, 2, 3, 4] as const) {
    const m = css.match(new RegExp(`--dur-${k}:(\\d+)ms`));
    assert.ok(m, `--dur-${k} ontbreekt`);
    assert.equal(Number(m![1]), DUUR[k]);
  }
});

await t("reduced motion is één centraal blok voor het hele document", () => {
  const blokken = css.match(/@media \(prefers-reduced-motion:reduce\)/g) ?? [];
  assert.equal(blokken.length, 1);
  const blok = css.slice(css.indexOf("@media (prefers-reduced-motion:reduce)"));
  const einde = blok.slice(0, blok.indexOf("\n}\n"));
  assert.match(einde, /\*,\*::before,\*::after\{[^}]*animation-duration:\.01ms !important/);
  assert.match(einde, /transition-duration:\.01ms !important/);
  assert.match(einde, /animation-iteration-count:1 !important/);
  assert.match(einde, /scroll-behavior:auto !important/);
  assert.doesNotMatch(einde, /\.app/);
  // View-transition-pseudo's bestaan alleen in het uitgestelde bestand; daar ook de uitzetting bij reduced motion
  assert.match(uitgesteld.slice(uitgesteld.indexOf("@media (prefers-reduced-motion:reduce)")), /::view-transition-old\(\*\)[^}]*animation:none !important/);
});

await t("kaart-entree: alleen opacity/transform, nooit op .nc-head of de kaart zelf", () => {
  const kf = css.match(/@keyframes kaart-in\{([^\n]*)\}\n/)![1];
  assert.doesNotMatch(kf, /(height|width|top|left|margin|padding)/);
  assert.match(css, /\.nc\.wacht \.nc-body > \*\{opacity:0\}/);
  assert.doesNotMatch(css, /nc-head[^{]*\{[^}]*kaart-in/);
  assert.doesNotMatch(css, /\.nc:not\(\.seen\)/);
});

await t("er is maar één prefers-reduced-motion-check in de JS-bronnen", () => {
  const bronnen = ["App.tsx", "feed.tsx", "sheet.tsx", "terugvegen.ts", "beelden.tsx", "filters-blad.tsx", "beweging.ts"];
  const treffers = bronnen.filter((f) => readFileSync(`src/${f}`, "utf8").includes("prefers-reduced-motion"));
  assert.deepEqual(treffers, ["beweging.ts"]);
});

console.log(`\n${n} tests OK`);

await t("rubriekwissel/shimmer (#538): richting, keyframes alleen transform, 300ms vertraging, reduced motion statisch", async () => {
  const { wisselRichting } = await import("../src/tabs");
  assert.equal(wisselRichting("alles", "nl"), 1);
  assert.equal(wisselRichting("dumpert", "filmpjes"), -1);
  assert.equal(wisselRichting("nl", "nl"), 0);
  const kf = /@keyframes glans\{([^@]*?\}?)\}\n/.exec(uitgesteld)![1];
  assert.match(kf, /transform/);
  assert.doesNotMatch(kf, /opacity|left|width|margin/);
  assert.match(alles, /\.skel::after[^{]*\{[^}]*animation:glans 1\.4s var\(--ease-standaard\) 300ms infinite/);
  assert.match(alles, /\.skel::after,\.d-meer-laden span::after\{display:none\}/);
  assert.doesNotMatch(alles, /animation:pulse|animation:ml /);
  assert.match(alles, /\.seg-ind\{[^}]*transition:transform var\(--dur-3\) var\(--ease-in\)/);
});
