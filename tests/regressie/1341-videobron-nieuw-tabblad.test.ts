import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { VideoGrid } from "../../src/video";
import type { Video } from "../../src/types";

for (const embed of ["https://example.com/film.mp4", undefined]) {
  const video: Video = { titel: "Een filmpje", bron: "Bron A", href: "https://example.com/film", embed, ai: "", thumb: "", populariteit: "", tijd: "", soort: "short" };
  const html = renderToStaticMarkup(createElement(VideoGrid, {
    list: [video], cat: "filmpjes", bionic: false, bronFilter: true, enter: false, video: null,
    onOpen: () => {}, onCloseFeed: () => {},
  }));
  assert.match(html, /<a href="https:\/\/example\.com\/film" target="_blank" rel="noreferrer" class="v-ext">Open bij bron \(nieuw tabblad\)/);
  assert.match(html, embed ? /Speel af: Een filmpje/ : /Een filmpje \(speelt alleen bij Bron A\)/);
}
