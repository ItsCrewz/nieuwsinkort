import assert from "node:assert/strict";
import { volgFeedHerstel } from "../../src/video";
import type { FeedStatus } from "../../src/feedstatus";

const O = "https://www.youtube-nocookie.com";
const g = globalThis as any;
const win = new EventTarget() as any;
const doc = new EventTarget() as any;
let tik = () => {};
win.setInterval = (fn: () => void) => { tik = fn; return 1; };
win.clearInterval = () => {};
g.window = win;
g.document = doc;
g.location = { hash: "#/filmpjes/a" };
g.history = { state: null, replaceState() {} };
g.sessionStorage = { setItem() {} };
doc.visibilityState = "visible";
const opdrachten: { frame: string; func: string; args: unknown[]; origin: string }[] = [];
const maakFrame = (naam: string) => ({ contentWindow: { postMessage(bericht: string, origin: string) { opdrachten.push({ frame: naam, ...JSON.parse(bericht), origin }); } } });
const A = maakFrame("A"), B = maakFrame("B");
let actief = A;
doc.querySelector = () => ({ querySelector: (selector: string) => selector === "video" ? null : actief });
doc.querySelectorAll = () => [A, B];
const saved: FeedStatus = { cat: "filmpjes", slug: "b", soort: "short", positie: 42, speelt: true, lijst: [] };
const meld = (frame: typeof A, origin = O) => win.dispatchEvent(Object.assign(new Event("message"), { origin, source: frame.contentWindow, data: JSON.stringify({ event: "onReady" }) }));
const navigeer = (slug: string, frame: typeof A) => { g.location.hash = `#/filmpjes/${slug}`; actief = frame; tik(); };
const seek = () => opdrachten.filter((opdracht) => opdracht.func === "seekTo");

// B meldt gereed als buur; de eerste update na de snelle wissel herstelt direct.
let stop = volgFeedHerstel("a", "filmpjes", [], "a", saved);
meld(B);
assert.equal(seek().length, 0);
navigeer("b", B);
tik();
assert.deepEqual(seek(), [{ frame: "B", event: "command", func: "seekTo", args: [42, true], origin: O }]);
navigeer("a", A);
navigeer("b", B);
tik();
assert.equal(seek().length, 2);
assert.deepEqual(seek()[1], seek()[0]);
stop();

// Een vertraagde melding van de verlaten speler herstelt de actieve speler niet.
opdrachten.length = 0;
g.location.hash = "#/filmpjes/b"; actief = B;
stop = volgFeedHerstel("b", "filmpjes", [], "b", saved);
tik();
assert.equal(seek().length, 0);
navigeer("a", A);
meld(B);
assert.equal(seek().length, 0);
navigeer("b", B);
tik();
assert.equal(seek().length, 1);
assert.deepEqual(seek()[0].args, [42, true]);
stop();

// Een actieve speler wacht op zijn eigen geldige gereedmelding.
opdrachten.length = 0;
stop = volgFeedHerstel("b", "filmpjes", [], "b", saved);
meld(B, "https://evil.example");
tik();
assert.equal(seek().length, 0);
meld(B);
tik();
assert.equal(seek().length, 1);
assert.deepEqual(seek()[0].args, [42, true]);
stop();
console.log("✓ YouTube-herstel bij gereedmelding, wisselen en terugkeer (#661)");
