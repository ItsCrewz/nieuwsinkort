import assert from "node:assert/strict";
import { volgFeedHerstel } from "../../src/video";
import { leesFeed, type FeedStatus } from "../../src/feedstatus";

const O = "https://www.youtube-nocookie.com";
const g = globalThis as any;
const win = new EventTarget() as any;
const doc = new EventTarget() as any;
let tik = () => {};
win.setInterval = (fn: () => void) => { tik = fn; return 1; };
win.clearInterval = () => {};
g.window = win;
g.document = doc;
g.location = { hash: "#/filmpjes/b" };
let bewaard: FeedStatus | null = null;
g.history = { state: null, replaceState(s: any) { g.history.state = s; bewaard = s?.feed ?? null; } };
g.sessionStorage = { setItem() {}, getItem: () => null };
doc.visibilityState = "visible";
const frame = { contentWindow: { postMessage() {} } as any };
const video = { readyState: 4, currentTime: 5, paused: true };
let soort: "video" | "yt" = "video";
doc.querySelector = () => ({ querySelector: (s: string) => (s === "video" ? (soort === "video" ? video : null) : soort === "yt" ? frame : null) });
doc.querySelectorAll = () => [frame];
const status = (slug: string, speelt: boolean): FeedStatus => ({ cat: "filmpjes", slug, soort: "short", positie: 42, speelt, lijst: [] });
const yt = (state: number) => win.dispatchEvent(Object.assign(new Event("message"), { origin: O, source: frame.contentWindow, data: JSON.stringify({ info: { playerState: state, currentTime: 7 } }) }));
const meldGereed = () => win.dispatchEvent(Object.assign(new Event("message"), { origin: O, source: frame.contentWindow, data: JSON.stringify({ event: "onReady" }) }));
const speeltNu = () => (bewaard as FeedStatus | null)?.speelt;

// Native video: bewust gepauzeerd blijft gepauzeerd, ook na meerdere updates.
soort = "video"; video.paused = true; g.location.hash = "#/filmpjes/b";
let stop = volgFeedHerstel("b", "filmpjes", [], "b", status("b", false));
tik(); tik();
assert.equal(speeltNu(), false);
video.paused = false; tik();
assert.equal(speeltNu(), true);
video.paused = true; tik();
assert.equal(speeltNu(), false);
stop();

// Native video: een eerder spelend filmpje overschrijft de status niet voor autoplay, daarna wel.
video.paused = true;
stop = volgFeedHerstel("b", "filmpjes", [], "b", status("b", true));
tik();
assert.equal(speeltNu(), true);
video.paused = false; tik();
assert.equal(speeltNu(), true);
video.paused = true; tik();
assert.equal(speeltNu(), false);
stop();

// Een ander filmpje erft de pauzestand niet (het speelt, de feed start het).
video.paused = false; g.location.hash = "#/filmpjes/c";
stop = volgFeedHerstel("c", "filmpjes", [], "c", status("b", false));
tik();
assert.equal(speeltNu(), true);
stop();
// Zelfde slug maar andere rubriek: ook niet.
g.location.hash = "#/filmpjes/b";
stop = volgFeedHerstel("b", "filmpjes", [], "b", { ...status("b", false), cat: "dumpert" });
assert.equal(speeltNu(), true);
stop();

// iframe-speler (YouTube).
soort = "yt"; g.location.hash = "#/filmpjes/b";
stop = volgFeedHerstel("b", "filmpjes", [], "b", status("b", false));
meldGereed(); yt(2); tik();
assert.equal(speeltNu(), false);
yt(1); tik();
assert.equal(speeltNu(), true);
stop();
stop = volgFeedHerstel("b", "filmpjes", [], "b", status("b", true));
yt(5); tik();
assert.equal(speeltNu(), true);
yt(1); yt(2); tik();
assert.equal(speeltNu(), false);
stop();

// Terugkeer via geschiedenis en herladen: sessionStorage beschikbaar of geblokkeerd.
const opgeslagen = status("b", false);
g.sessionStorage = { getItem: () => JSON.stringify(opgeslagen), setItem() {} };
g.history = { state: null };
assert.equal(leesFeed()?.speelt, false);
g.sessionStorage = { getItem() { throw new Error("geblokkeerd"); }, setItem() { throw new Error("geblokkeerd"); } };
g.history = { state: { feed: opgeslagen } };
assert.equal(leesFeed()?.speelt, false);
assert.equal(leesFeed()?.slug, "b");
g.history = { state: null };
assert.equal(leesFeed(), null);
console.log("✓ gepauzeerd filmpje blijft gepauzeerd na terugkeer (#1419)");
