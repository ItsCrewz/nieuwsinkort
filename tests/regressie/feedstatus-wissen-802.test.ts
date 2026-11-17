// #802: sluiten wist de videostatus uit sessionStorage én history.state, en een daarna geopende feed neemt hem niet over;
// herladen met bewaarde status blijft werken (VideoGrid leest de status bij de eerste render).
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { zetNepDom } from "../hulp/nepdom";
import { videoSlug } from "../../src/slug";
import type { FeedStatus } from "../../src/feedstatus";
import type { Video } from "../../src/types";
import { VideoGrid } from "../../src/video";

const maak = (n: string) => ({ titel: `Filmpje ${n}`, href: `https://voorbeeld.nl/${n}`, bron: "test" }) as Video;
const [a, b, c, d] = ["a", "b", "c", "d"].map(maak);
const dom = zetNepDom({});
const KEY = "nieuwsinkort-feedstatus";
// touch aan, anders draait de feed (en dus de statusopslag) niet; history met eigen toestand
(globalThis as unknown as { window: { matchMedia: unknown } }).window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
const gesch = { state: null as unknown, replaceState(s: unknown) { this.state = s; } };
Object.defineProperty(globalThis, "history", { value: gesch, configurable: true, writable: true });
Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
const opgeslagen = (): FeedStatus | null => JSON.parse(sessionStorage.getItem(KEY) || "null");

// herladen: bewaarde status met lijst [a,b,c], positie op c; c is uit de verse lijst verdwenen
const oud: FeedStatus = { cat: "filmpjes", slug: videoSlug(c), soort: "short", positie: 5, speelt: true, lijst: [a, b, c] };
sessionStorage.setItem(KEY, JSON.stringify(oud));
gesch.state = { ander: 1, feed: oud };

const { createRoot } = await import("react-dom/client");
const root = createRoot(dom.container as unknown as Element);
const render = (video: string | null) => act(async () => root.render(createElement(VideoGrid, {
  list: [a, b, d], cat: "filmpjes", bionic: false, bronFilter: false, enter: false, video,
  onOpen: () => {}, onCloseFeed: () => {},
})));

await render(videoSlug(c));
assert.equal(opgeslagen()?.slug, videoSlug(d), "herladen: naburig filmpje uit de bewaarde status");

await render(null);
assert.equal(sessionStorage.getItem(KEY), null, "sluiten wist sessionStorage");
assert.equal((gesch.state as { feed?: unknown }).feed, undefined, "sluiten wist history.state.feed");
assert.equal((gesch.state as { ander?: number }).ander, 1, "andere historyvelden blijven");

await render(videoSlug(c));
assert.equal(opgeslagen()?.slug, videoSlug(a), "opnieuw openen neemt de gewiste positie niet over");
await act(async () => root.unmount());
console.log("✓ gewiste feedstatus komt niet terug, herladen herstelt wel (#802)");
