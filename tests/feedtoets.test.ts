// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { BEDIENING, buitenFeedBediening } from "../src/feedtoets";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const resultaat = fn();
  if (resultaat instanceof Promise) return resultaat.then(klaar);
  klaar();
};

// Kleine nep-DOM: element met tag, attributen, klassen en ouder; closest() kent alleen de selectors die BEDIENING en ".nf" nodig hebben.
type El = { tag: string; attrs: Record<string, string>; klassen: string[]; ouder: El | null; closest(s: string): El | null };
const el = (tag: string, o: { attrs?: Record<string, string>; klassen?: string[]; ouder?: El | null } = {}): El => {
  const e: El = {
    tag, attrs: o.attrs || {}, klassen: o.klassen || [], ouder: o.ouder || null,
    closest(s) {
      const delen = s.split(",");
      for (let c: El | null = e; c; c = c.ouder) {
        const x = c;
        if (delen.some((d) => {
          const m = d.match(/^([a-z]*)(?:\.([\w-]+)|\[([\w-]+)(?:=([\w-]+))?\])?$/)!;
          return (!m[1] || m[1] === x.tag) && (!m[2] || x.klassen.includes(m[2])) && (!m[3] || (m[3] in x.attrs && (m[4] === undefined || x.attrs[m[3]] === m[4])));
        })) return c;
      }
      return null;
    },
  };
  return e;
};

const body = el("body");
const box = el("div", { klassen: ["nf-box"], ouder: body });
const feed = el("div", { klassen: ["nf"], ouder: box });
const ui = el("div", { klassen: ["nf-ui"], ouder: box });

t("feedtoets: eigen feedknoppen (.nf-ui, .nf-start) laten de sneltoetsen werken", () => {
  const knop = el("button", { klassen: ["nf-btn"], ouder: ui });
  assert.equal(buitenFeedBediening(knop), false);
  assert.equal(buitenFeedBediening(el("span", { ouder: knop })), false);
  assert.equal(buitenFeedBediening(el("button", { klassen: ["nf-start"], ouder: box })), false);
});

t("feedtoets: knop, link en tab buiten de feed zijn bediening", () => {
  assert.equal(buitenFeedBediening(el("button", { ouder: body })), true);
  assert.equal(buitenFeedBediening(el("a", { attrs: { href: "/x" }, ouder: body })), true);
  assert.equal(buitenFeedBediening(el("div", { attrs: { role: "tab" }, ouder: body })), true);
  const knop = el("button", { ouder: body });
  assert.equal(buitenFeedBediening(el("span", { ouder: knop })), true);
});

t("feedtoets: knop of link binnen de feed laat de sneltoetsen werken", () => {
  assert.equal(buitenFeedBediening(el("button", { ouder: feed })), false);
  assert.equal(buitenFeedBediening(el("a", { attrs: { href: "/x" }, ouder: feed })), false);
});

t("feedtoets: fotocarrousel binnen de feed (tabindex=0) is geen bediening", () => {
  assert.equal(buitenFeedBediening(el("div", { klassen: ["bl-track"], attrs: { tabindex: "0" }, ouder: feed })), false);
});

t("feedtoets: null, body en neutraal doel met tabindex=0 zijn geen bediening", () => {
  assert.equal(buitenFeedBediening(null), false);
  assert.equal(buitenFeedBediening(body), false);
  assert.equal(buitenFeedBediening(el("main", { attrs: { tabindex: "0" }, ouder: body })), false);
  assert.equal(BEDIENING.includes("tabindex"), false);
});

t("feedtoets: <a> zonder href is geen bediening", () => {
  assert.equal(buitenFeedBediening(el("a", { ouder: body })), false);
});

console.log(`\n${n} tests geslaagd`);
