import assert from "node:assert/strict";
import { decodeTeller, EERSTE_FRAME_MS, FrameGezondheid, frameTeller, frameTellerBron, HerstelBudget, type FrameTik } from "../src/framegezondheid";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const tik = (now: number, currentTime: number, frames: number | null, extra: Partial<FrameTik> = {}): FrameTik => ({
  now, currentTime, frames, paused: false, hidden: false, seeking: false, ended: false, seekRecent: false,
  videoWidth: 720, readyState: 4, ...extra,
});
/** Speelt `ms` af in stappen van 500 ms met klok `snelheid` (s per s) en geeft het eerste niet-ok besluit. */
function speel(fg: FrameGezondheid, start: number, ms: number, opts: { t0?: number; snelheid?: number; frames?: (now: number) => number | null; extra?: Partial<FrameTik> } = {}) {
  const { t0 = 0, snelheid = 1, frames = () => 10, extra = {} } = opts;
  for (let now = start; now <= start + ms; now += 500) {
    const b = fg.tik(tik(now, t0 + ((now - start) / 1000) * snelheid, frames(now), extra));
    if (b !== "ok") return { b, now };
  }
  return { b: "ok" as const, now: start + ms };
}

t("gezond: klok loopt en beelden komen", () => {
  const fg = new FrameGezondheid();
  assert.equal(speel(fg, 0, 20000, { frames: (now) => 1 + Math.floor(now / 40) }).b, "ok");
});

t("klok loopt zonder nieuwe beelden: frame-vast na ~2,5 s", () => {
  const fg = new FrameGezondheid();
  const r = speel(fg, 0, 10000, { frames: () => 42 });
  assert.equal(r.b, "frame-vast");
  assert.ok(r.now >= 2500 && r.now <= 3500, String(r.now));
});

t("trage klok (0,3 s per s) zonder beelden wordt ook gevonden", () => {
  const fg = new FrameGezondheid();
  const r = speel(fg, 0, 15000, { snelheid: 0.3, frames: () => 42 });
  assert.equal(r.b, "frame-vast");
  assert.ok(r.now >= 3000, String(r.now));
});

t("stilstaande klok (buffering) is geen frame-vast: dat is werk voor Stall", () => {
  const fg = new FrameGezondheid();
  assert.equal(speel(fg, 0, 15000, { snelheid: 0, frames: () => 42 }).b, "ok");
});

t("geen eerste beeld terwijl de klok loopt", () => {
  const fg = new FrameGezondheid();
  const r = speel(fg, 0, 10000, { frames: () => 0 });
  assert.equal(r.b, "geen-eerste-frame");
  assert.ok(r.now >= EERSTE_FRAME_MS, String(r.now));
});

t("breedte 0 telt als geen beeld, ook met tellers", () => {
  const fg = new FrameGezondheid();
  const r = speel(fg, 0, 10000, { frames: (now) => Math.floor(now / 40), extra: { videoWidth: 0 } });
  assert.equal(r.b, "geen-eerste-frame");
});

t("geen eerste beeld bij data klaar maar stilstaande klok", () => {
  const fg = new FrameGezondheid();
  assert.equal(speel(fg, 0, 10000, { snelheid: 0, frames: () => 0, extra: { readyState: 4 } }).b, "geen-eerste-frame");
});

t("zonder data en zonder klokvoortgang geen oordeel over het eerste beeld (netwerk traag)", () => {
  const fg = new FrameGezondheid();
  assert.equal(speel(fg, 0, 20000, { snelheid: 0, frames: () => 0, extra: { readyState: 1, videoWidth: 0 } }).b, "ok");
});

t("zonder teller: alleen eerste-beeldcontrole op breedte/readyState", () => {
  const fg = new FrameGezondheid();
  assert.equal(speel(fg, 0, 20000, { frames: () => null }).b, "ok");
  const leeg = new FrameGezondheid();
  assert.equal(speel(leeg, 0, 10000, { frames: () => null, extra: { videoWidth: 0 } }).b, "geen-eerste-frame");
});

t("pauze, seek, gebruikersseek, achtergrond en einde onderdrukken en resetten", () => {
  for (const veld of ["paused", "seeking", "seekRecent", "hidden", "ended"] as const) {
    const fg = new FrameGezondheid();
    // 2 s zonder beelden, dan onderdrukt, daarna weer 2 s: telt niet op tot een melding.
    assert.equal(speel(fg, 0, 2000, { frames: () => 5 }).b, "ok", veld);
    assert.equal(speel(fg, 2500, 10000, { t0: 2, frames: () => 5, extra: { [veld]: true } }).b, "ok", veld);
    assert.equal(speel(fg, 13000, 1500, { t0: 12, frames: () => 5 }).b, "ok", veld);
    // Daarna wel: de telling liep vanaf het einde van de onderdrukking.
    assert.equal(speel(fg, 15000, 3000, { t0: 14, frames: () => 5 }).b, "frame-vast", veld);
  }
});

t("loop (klok springt terug) en grote sprong tellen niet als voortgang", () => {
  const fg = new FrameGezondheid();
  let b = fg.tik(tik(0, 9, 5));
  for (let now = 500; now <= 6000; now += 500) b = fg.tik(tik(now, now % 1000 ? 9.4 : 0.1, 5));
  assert.equal(b, "ok");
  const sprong = new FrameGezondheid();
  sprong.tik(tik(0, 1, 5));
  for (let now = 500, t0 = 1; now <= 6000; now += 500, t0 += 30) assert.equal(sprong.tik(tik(now, t0, 5)), "ok");
});

t("één melding per meting (de beller herstelt en begint opnieuw)", () => {
  const fg = new FrameGezondheid();
  assert.equal(speel(fg, 0, 10000, { frames: () => 42 }).b, "frame-vast");
  assert.equal(speel(fg, 10500, 20000, { t0: 10, frames: () => 42 }).b, "ok");
});

t("herstelbudget: 2 per minuut, 4 per speler, daarna nooit meer", () => {
  const b = new HerstelBudget();
  assert.equal(b.probeer(0), true);
  assert.equal(b.probeer(1000), true);
  assert.equal(b.probeer(2000), false);
  assert.equal(b.probeer(61000), true);
  assert.equal(b.probeer(62000), true);
  assert.equal(b.probeer(200000), false);
  assert.equal(b.probeer(1e7), false);
});

t("frameTeller: rVFC leidend zodra hij vuurde, anders decodeerteller, anders null", () => {
  assert.equal(frameTeller({ gepresenteerd: 3, gedecodeerd: 9, rvfc: true, decode: true }), 3);
  assert.equal(frameTeller({ gepresenteerd: 0, gedecodeerd: 9, rvfc: true, decode: true }), 9);
  assert.equal(frameTeller({ gepresenteerd: 0, gedecodeerd: 0, rvfc: true, decode: false }), 0);
  assert.equal(frameTeller({ gepresenteerd: 0, gedecodeerd: 4, rvfc: false, decode: true }), 4);
  assert.equal(frameTeller({ gepresenteerd: 0, gedecodeerd: 0, rvfc: false, decode: false }), null);
});

t("decodeTeller: getVideoPlaybackQuality, anders webkitDecodedFrameCount", () => {
  assert.equal(decodeTeller({ getVideoPlaybackQuality: () => ({ totalVideoFrames: 7 }), webkitDecodedFrameCount: 3 }), 7);
  assert.equal(decodeTeller({ webkitDecodedFrameCount: 3 }), 3);
  assert.equal(decodeTeller({}), null);
});

t("tellerwisseling decode -> presentatie: geen valse melding, daarna vooruitgang bewaakt", () => {
  const fg = new FrameGezondheid();
  // Decodeerteller loopt (grote waarde), daarna schakelt de bron over op een kleinere presentatieteller.
  assert.equal(speel(fg, 0, 3000, { frames: (n) => 500 + n / 40, extra: { bron: "decode" } }).b, "ok");
  assert.equal(speel(fg, 3500, 6000, { t0: 3, frames: (n) => 2 + (n - 3500) / 40, extra: { bron: "presentatie" } }).b, "ok");
  // Presentatieteller staat daarna echt stil: melding.
  assert.equal(speel(fg, 10000, 4000, { t0: 9, frames: () => 300, extra: { bron: "presentatie" } }).b, "frame-vast");
});

t("tellerwisseling met stilstaande nieuwe teller: melding 2,5 s na de wisseling, niet eerder", () => {
  const fg = new FrameGezondheid();
  assert.equal(speel(fg, 0, 1500, { frames: () => 80, extra: { bron: "decode" } }).b, "ok");
  const r = speel(fg, 2000, 5000, { t0: 1.5, frames: () => 5, extra: { bron: "presentatie" } });
  assert.equal(r.b, "frame-vast");
  assert.equal(r.now - 2000, 2500);
});

t("tellerwisseling met gelijke waarde (1 -> 1): geen valse melding op de wisseltik (faalt op main)", () => {
  const fg = new FrameGezondheid();
  assert.equal(speel(fg, 0, 2000, { frames: () => 1, extra: { bron: "decode" } }).b, "ok");
  // Op 2500 vuurt rVFC voor het eerst: presentatieteller 1, daarna loopt hij door.
  assert.equal(speel(fg, 2500, 10000, { t0: 2.5, frames: (n) => 1 + Math.floor((n - 2500) / 40), extra: { bron: "presentatie" } }).b, "ok");
});

t("tellerwisseling met gelijke waarde en daarna stilstand: melding exact 2,5 s na de wisseling", () => {
  const fg = new FrameGezondheid();
  assert.equal(speel(fg, 0, 2000, { frames: () => 1, extra: { bron: "decode" } }).b, "ok");
  const r = speel(fg, 2500, 10000, { t0: 2.5, frames: () => 1, extra: { bron: "presentatie" } });
  assert.equal(r.b, "frame-vast");
  assert.equal(r.now, 5000);
});

t("echte stilstand zonder wisseling en normale voortgang blijven gelijk; frameTellerBron", () => {
  assert.equal(speel(new FrameGezondheid(), 0, 3500, { frames: () => 7, extra: { bron: "decode" } }).b, "frame-vast");
  assert.equal(speel(new FrameGezondheid(), 0, 20000, { frames: (n) => n / 40, extra: { bron: "presentatie" } }).b, "ok");
  assert.equal(frameTellerBron({ gepresenteerd: 3, rvfc: true, decode: true }), "presentatie");
  assert.equal(frameTellerBron({ gepresenteerd: 0, rvfc: true, decode: true }), "decode");
  assert.equal(frameTellerBron({ gepresenteerd: 0, rvfc: true, decode: false }), "presentatie");
  assert.equal(frameTellerBron({ gepresenteerd: 0, rvfc: false, decode: false }), null);
});
