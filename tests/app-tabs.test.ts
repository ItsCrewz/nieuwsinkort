import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { Briefing, Tabs } from "../src/app-tabs";
import type { Data, Item } from "../src/types";

const briefing = (text: string, sources: number, time = "", note = "", bionic = false) =>
  renderToStaticMarkup(createElement(Briefing, { text, sources, time, note, bionic }));

const leeg = briefing("", 0, "12:00");
assert.match(leeg, /aria-label="In het kort"/);
assert.match(leeg, /De samenvatting van vandaag komt er zo aan\./);
assert.doesNotMatch(leeg, /brief-meta|12:00|brief-note/);

const gevuld = briefing("Een bericht", 1, "12:00", "Let op");
assert.match(gevuld, /<p class="brief-text bn">Een bericht<\/p>/);
assert.match(gevuld, /Samengevat uit 1 bron · <span class="tnum">12:00<\/span>/);
assert.match(gevuld, /<p class="brief-note">Let op<\/p>/);
assert.match(briefing("Nieuws vandaag", 2, "", "", true), /<b>/);
assert.match(briefing("Nieuws", 2), /Samengevat uit 2 bronnen/);
assert.doesNotMatch(briefing("Nieuws", 2), /class="tnum"/);
assert.doesNotMatch(briefing("Nieuws", -1), /brief-meta/);

const data = { items: [{ cat: "nl" }, { cat: "tech" }] as Item[] } as Data;
const tabs = (view: "alles" | "nl" | "sport") => renderToStaticMarkup(createElement(Tabs, { data, view, onChange: () => {} }));
const html = tabs("nl");
assert.match(html, /<nav class="tabs" aria-label="Rubrieken">/);
assert.match(html, /role="tablist" aria-label="Rubrieken"/);
assert.match(html, /id="rubriek-tab-nl"[^>]*aria-controls="rubriek-paneel" aria-selected="true" tabindex="0"/);
assert.match(html, /id="rubriek-tab-alles"[^>]*aria-selected="false" tabindex="-1"/);
assert.match(html, /id="rubriek-tab-tech"/);
assert.match(html, /id="rubriek-tab-filmpjes" data-video-tab=""/);
assert.match(html, /id="rubriek-tab-dumpert" data-video-tab=""/);
assert.doesNotMatch(html, /id="rubriek-tab-sport"/);
assert.match(tabs("sport"), /id="rubriek-tab-sport"[^>]*aria-selected="true"/);
