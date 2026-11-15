import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { Briefing, Tabs } from "../src/app-tabs";
import type { Data, View } from "../src/types";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const briefing = (extra: Partial<Parameters<typeof Briefing>[0]> = {}) => renderToStaticMarkup(createElement(Briefing, {
  text: "Nieuws vandaag", bionic: false, sources: 0, time: "", ...extra,
}));
const tabs = (view: View, cats: Array<"nl" | "tech"> = []) => renderToStaticMarkup(createElement(Tabs, {
  data: { items: cats.map((cat) => ({ cat })) } as Data, view, onChange: () => {},
}));

t("briefing toont tekst, bronvermelding, tijd en opmerking", () => {
  const html = briefing({ sources: 1, time: "12:30", note: "Let op" });
  assert.match(html, /aria-label="In het kort"/);
  assert.match(html, /Nieuws vandaag/);
  assert.match(html, /Samengevat uit 1 bron · <span class="tnum">12:30<\/span>/);
  assert.match(html, /<p class="brief-note">Let op<\/p>/);
  assert.match(briefing({ sources: 2 }), /Samengevat uit 2 bronnen/);
  assert.doesNotMatch(briefing({ sources: 2 }), /tnum| · /);
});

t("lege briefing toont wachttekst zonder bronvermelding of opmerking", () => {
  const html = briefing({ text: "", time: "12:30", note: "" });
  assert.match(html, /De samenvatting van vandaag komt er zo aan\./);
  assert.doesNotMatch(html, /brief-meta|brief-note|12:30/);
});

t("briefing geeft focus-lezen door en ontsnapt tekst", () => {
  assert.match(briefing({ text: "Nieuws", bionic: true }), /<b>Nie<\/b>uws/);
  assert.match(briefing({ text: "<nieuws>", note: "<let op>" }), /&lt;nieuws&gt;/);
  assert.match(briefing({ note: "<let op>" }), /&lt;let op&gt;/);
});

t("tabs tonen gevulde rubrieken en een geselecteerde actieve tab", () => {
  const html = tabs("nl", ["nl", "tech"]);
  assert.match(html, /<nav class="tabs" aria-label="Rubrieken">/);
  assert.match(html, /role="tablist" aria-label="Rubrieken"/);
  assert.match(html, /class="tab cat-nl" role="tab" aria-controls="rubriek-paneel" aria-selected="true" tabindex="0">Nederland<\/button>/);
  assert.match(html, /class="tab cat-tech" role="tab" aria-controls="rubriek-paneel" aria-selected="false" tabindex="-1">Tech &amp; AI<\/button>/);
  assert.doesNotMatch(html, /class="tab cat-sport"/);
  assert.match(html, /class="tab cat-filmpjes" role="tab" data-video-tab=""/);
  assert.match(html, /class="tab cat-dumpert" role="tab" data-video-tab=""/);
  assert.doesNotMatch(html, /class="more-wrap"/);
});

t("tabs behouden een actieve lege rubriek en tonen de meetkopie", () => {
  const html = tabs("tech");
  assert.match(html, /class="tab cat-tech" role="tab" aria-controls="rubriek-paneel" aria-selected="true" tabindex="0"/);
  assert.match(html, /class="seg-measure" aria-hidden="true"/);
  assert.match(html, /class="seg m-long"/);
  assert.match(html, /class="seg m-short"/);
  assert.doesNotMatch(html, /class="tab cat-nl"/);
});
