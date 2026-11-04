import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { VideoGrid } from "../src/video";
import type { Video } from "../src/types";

const filmpje = (extra: Partial<Video> = {}): Video => ({
  titel: "Een filmpje", ai: "Een korte uitleg", bron: "Bron A", href: "https://example.com/video",
  embed: "https://example.com/video.mp4", thumb: "https://example.com/plaatje.jpg",
  populariteit: "123 views", tijd: "12:00", soort: "short", ...extra,
});
const render = (list: Video[], extra: Partial<Parameters<typeof VideoGrid>[0]> = {}) => renderToStaticMarkup(createElement(VideoGrid, {
  list, cat: "filmpjes", bionic: false, bronFilter: true, enter: true, video: null,
  onOpen: () => {}, onCloseFeed: () => {}, ...extra,
}));

const leeg = render([]);
assert.match(leeg, /Nog geen filmpjes vandaag/);
assert.match(render([], { cat: "dumpert" }), /Nog geen Dumpert-filmpjes vandaag/);

const kaarten = render([
  filmpje(),
  filmpje({ titel: "Ander filmpje", bron: "Bron B", href: "https://example.com/twee", thumb: "", populariteit: "42 likes", ai: "", tijd: "" }),
  filmpje({ titel: "Het journaal", soort: "journaal" }),
]);
assert.match(kaarten, /Soort filmpjes/);
assert.match(kaarten, /Filter op bron/);
assert.match(kaarten, /Bron A/);
assert.match(kaarten, /Bron B/);
assert.match(kaarten, /Een korte uitleg/);
assert.match(kaarten, /123 views/);
assert.match(kaarten, /42 likes/);
assert.match(kaarten, /vthumb-name/);
assert.doesNotMatch(kaarten, /Het journaal/);
assert.match(kaarten, /loading="eager"/);

const groepen = render([filmpje({ groep: "Sport" }), filmpje({ titel: "Nieuwsbericht", groep: "Nieuws" })]);
assert.ok(groepen.indexOf('id="vgroep-Nieuws"') < groepen.indexOf('id="vgroep-Sport"'));
assert.match(groepen, /Nieuwsbericht/);
const dumpert = render([filmpje({ titel: "Dumpertclip", embed: undefined })], { cat: "dumpert" });
assert.match(dumpert, /Dumpertclip/);
assert.doesNotMatch(dumpert, /Soort filmpjes/);
assert.match(dumpert, /speelt alleen bij Bron A/);

const journaal = render([filmpje({ titel: "Uitzending", soort: "journaal" })]);
assert.match(journaal, /Uitzending/);
assert.match(render([filmpje({ soort: "journaal" })], { video: "onbekend" }), /Soort filmpjes/);
