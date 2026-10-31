import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ytStartBesluit, ytSkipBesluit, ytStatusNaam, ytEchteFout, geluidMag, geluidVoorSlide, autoplayGeblokkeerd, ytEmbedUrl, ytToonHint } from "../src/ytstart";

for (const actief of [true, false]) {
  const url = new URL(ytEmbedUrl("abc123", actief, "https://voorbeeld.nl"));
  assert.equal(url.origin, "https://www.youtube-nocookie.com");
  assert.equal(url.pathname, "/embed/abc123");
  for (const [naam, waarde] of Object.entries({ autoplay: actief ? "1" : "0", controls: "1", playsinline: "1", mute: "1", enablejsapi: "1", rel: "0", modestbranding: "1", iv_load_policy: "3", loop: "1", playlist: "abc123", origin: "https://voorbeeld.nl" })) assert.equal(url.searchParams.get(naam), waarde);
}

const basis = { actief: true, gepauzeerd: false, klaar: true, status: -1, pogingen: 0, sinds: 1000, nu: 1000 };
assert.equal(ytToonHint({ ...basis, nu: 2499 }), false);
assert.equal(ytToonHint({ ...basis, nu: 2500 }), true);
for (const status of [1, 3]) assert.equal(ytToonHint({ ...basis, status, nu: 2500 }), false);
assert.equal(ytToonHint({ ...basis, gespeeld: true, nu: 2500 }), false);
assert.equal(ytToonHint({ ...basis, actief: false, nu: 2500 }), false);
for (const code of [100, 101, 150, 152]) assert.equal(ytToonHint({ ...basis, fout: ytEchteFout(code), nu: 2500 }), false);
const css = readFileSync("src/index.css", "utf8");
const poster = css.match(/\.f-yt-poster\s*\{([^}]*)\}/)?.[1] ?? "";
assert.match(poster, /pointer-events\s*:\s*none/);
assert.match(poster, /z-index\s*:\s*1(?:\s|;|$)/);
const hint = css.match(/\.f-yt-start\s*\{([^}]*)\}/)?.[1] ?? "";
assert.match(hint, /pointer-events\s*:\s*none/);
assert.match(hint, /background\s*:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*\.5\s*\)/);
assert.doesNotMatch(hint, /\binset\s*:\s*0(?:\s|;|$)/);
// onReady, -1 en geen verdere events: drie pogingen binnen de activatietijd.
for (let i = 0; i < 3; i++) assert.equal(ytStartBesluit({ ...basis, pogingen: i, nu: 1000 + i * 500 }), "probeer");
assert.equal(ytStartBesluit({ ...basis, pogingen: 3, nu: 2500 }), "vangnet");
// Een al klaargemaakte buur start onmiddellijk bij activatie.
assert.equal(ytStartBesluit(basis), "probeer");
assert.equal(ytStartBesluit({ ...basis, gepauzeerd: true, nu: 2500 }), "vangnet");
assert.equal(ytStartBesluit({ ...basis, klaar: false, nu: 2500 }), "vangnet");
for (const status of [1, 3]) assert.equal(ytStartBesluit({ ...basis, status, nu: 2500 }), "wacht");
assert.equal(ytStartBesluit({ ...basis, gespeeld: true, status: 2, nu: 2500 }), "wacht");
assert.equal(ytStartBesluit({ ...basis, actief: false, nu: 2500 }), "wacht");
assert.equal(ytStartBesluit({ ...basis, fout: true, nu: 2500 }), "wacht");
for (const code of [100, 101, 150, 152]) { assert.equal(ytEchteFout(code), true); assert.equal(autoplayGeblokkeerd("onError", code), false); }
for (const soort of ["onAutoplayBlocked", "NotAllowedError"]) assert.equal(autoplayGeblokkeerd(soort), true);
// De 1,5 s-timeout en een niet-echte onError zijn geen geluidsweigering (#437): alleen de hint.
assert.equal(autoplayGeblokkeerd("timeout"), false);
assert.equal(autoplayGeblokkeerd("onError", 5), false);
// Geluid per bron: een YouTube-blokkade raakt native slides niet en andersom.
for (const kind of ["hls", "mp4"]) {
  assert.equal(geluidVoorSlide(kind, true, true, false, true), true);
  assert.equal(geluidVoorSlide(kind, true, true, true, false), false);
}
assert.equal(geluidVoorSlide("youtube", true, true, true, false), true);
assert.equal(geluidVoorSlide("youtube", true, true, false, true), false);
assert.equal(geluidVoorSlide("mp4", true, false, false, false), false);
assert.equal(geluidVoorSlide("mp4", false, true, false, false), false);
assert.equal(geluidMag(true, true, false), true);
assert.equal(geluidMag(true, false, false), false);
assert.equal(geluidMag(true, true, true), false);
assert.equal(geluidMag(false, true, false), false);
assert.equal(ytStatusNaam(-1), "unstarted");

for (const code of [100, 101, 150, 152]) assert.equal(ytSkipBesluit(code, true, false, true), true);
assert.equal(ytSkipBesluit(5, true, false, true), false);
assert.equal(ytSkipBesluit(150, false, false, true), false);
assert.equal(ytSkipBesluit(150, true, true, true), false);
assert.equal(ytSkipBesluit(150, true, false, true), true);
assert.equal(ytSkipBesluit(150, true, false, false), false);
