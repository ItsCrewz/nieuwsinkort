import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ytStartBesluit, ytStatusNaam, ytEchteFout, geluidMag, geluidVoorSlide, autoplayGeblokkeerd, ytEmbedUrl, ytToonHint, ytIsGereed, ytGereedLijst } from "../src/ytstart";

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

// #661: herstel pas na onReady van het actieve frame.
{
  const win = {}, ander = {};
  const frame = { contentWindow: win };
  const O = "https://www.youtube-nocookie.com";
  const ready = JSON.stringify({ event: "onReady" });
  assert.equal(ytIsGereed({ origin: O, source: win, data: ready }, frame), true);
  assert.equal(ytIsGereed({ origin: O, source: ander, data: ready }, frame), false); // ander frame / oude video
  assert.equal(ytIsGereed({ origin: "https://evil.example", source: win, data: ready }, frame), false);
  assert.equal(ytIsGereed({ origin: O, source: win, data: JSON.stringify({ event: "infoDelivery" }) }, frame), false); // nog niet gereed
  assert.equal(ytIsGereed({ origin: O, source: win, data: "geen json" }, frame), false);
  assert.equal(ytIsGereed({ origin: O, source: win, data: ready }, null), false);
  assert.equal(ytIsGereed({ origin: O, source: undefined, data: ready }, { contentWindow: null }), false);
}
// Scenario's: gereedmelding vóór de wissel, snelle wissel en terugkeer; seekTo precies één keer per herstel.
{
  const O = "https://www.youtube-nocookie.com";
  const ready = JSON.stringify({ event: "onReady" });
  const A = { contentWindow: {} }, B = { contentWindow: {} };
  const lijst = ytGereedLijst();
  const herstel = (actief: { contentWindow: unknown }, st: { hersteld: boolean; seeks: number }) => { if (!st.hersteld && lijst.is(actief.contentWindow)) { st.seeks++; st.hersteld = true; } };
  // Vooraf geladen buur B meldt gereed terwijl A actief is: telt mee, A blijft niet-gereed.
  assert.equal(lijst.meld({ origin: O, source: B.contentWindow, data: ready }, [A, B]), true);
  assert.equal(lijst.is(A.contentWindow), false);
  // Snelle wissel naar B vóór de volgende update: B is al gereed, geen nieuwe onReady nodig.
  const st = { hersteld: false, seeks: 0 };
  herstel(B, st); herstel(B, st);
  assert.equal(st.seeks, 1);
  // Terugkeer naar B na A: nog steeds gereed, nieuw herstel (hersteld gereset) = één seekTo, geen verloren melding.
  const st2 = { hersteld: false, seeks: 0 };
  herstel(A, st2); assert.equal(st2.seeks, 0); // A nog niet gereed: wachten
  lijst.meld({ origin: O, source: A.contentWindow, data: ready }, [A, B]); // vertraagde melding
  herstel(A, st2); herstel(A, st2);
  assert.equal(st2.seeks, 1);
  herstel(B, { hersteld: false, seeks: 0 }); assert.equal(lijst.is(B.contentWindow), true);
  // Vreemde origin / bron wordt niet onthouden.
  const C = { contentWindow: {} };
  assert.equal(lijst.meld({ origin: "https://evil.example", source: C.contentWindow, data: ready }, [C]), false);
  assert.equal(lijst.meld({ origin: O, source: {}, data: ready }, [C]), false);
  assert.equal(lijst.is(C.contentWindow), false);
}
{
  const src = readFileSync("src/video.tsx", "utf8");
  assert.ok(/else if \(gereed\.is\(frame\(\)\?\.contentWindow\)\) \{ stuur\("seekTo"/.test(src), "seekTo alleen na onReady van het actieve frame");
  assert.ok(!/else if \(frame\(\)\) \{ stuur\("seekTo"/.test(src));
}
