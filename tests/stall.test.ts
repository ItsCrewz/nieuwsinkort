import assert from "node:assert/strict";
import { Stall } from "../src/stall";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const invoer = (now: number, currentTime = 10) => ({ now, currentTime, paused: false, hidden: false,
  ended: false, seeking: false, herstelSeek: false, balkTijd: currentTime, bufferVooruit: 1 });

t("stilstand zonder waiting stopt de balk en beweging hervat hem", () => {
  const s = new Stall();
  assert.equal(s.tik(invoer(0)), "ok");
  assert.equal(s.tik(invoer(600)), "balk-stop");
  assert.equal(s.tik(invoer(900, 10.2)), "balk-sync");
  assert.equal(s.tik({ ...invoer(1200, 10.5), balkTijd: 11 }), "balk-sync");
});
t("na drie seconden nudge en drie seconden later herladen, ook na herstel-seek", () => {
  const s = new Stall();
  s.tik(invoer(0));
  assert.equal(s.tik(invoer(600)), "balk-stop");
  assert.equal(s.tik(invoer(3000)), "nudge");
  s.herstelNaar(12);
  assert.equal(s.tik({ ...invoer(3300, 12), seeking: true, herstelSeek: true }), "ok");
  assert.equal(s.tik(invoer(6000, 12)), "herlaad");
});
t("loop en seek gelden als beweging", () => {
  const s = new Stall();
  s.tik(invoer(0));
  assert.equal(s.tik(invoer(500, 0)), "ok");
  assert.equal(s.tik({ ...invoer(3500, 5), seeking: true }), "ok");
  assert.equal(s.tik(invoer(6500, 5)), "ok");
});
t("pauze, verborgen, einde en hervatten starten de telling opnieuw", () => {
  for (const veld of ["paused", "hidden", "ended"] as const) {
    const s = new Stall();
    s.tik(invoer(0));
    assert.equal(s.tik({ ...invoer(4000), [veld]: true }), "ok");
    assert.equal(s.tik(invoer(8000)), "ok");
  }
});

t("zonder data volgt herstel pas na tien seconden en herladen drie seconden later", () => {
  const s = new Stall();
  const leeg = (now: number) => ({ ...invoer(now), bufferVooruit: 0, readyState: 2 });
  assert.equal(s.tik(leeg(0)), "ok");
  assert.equal(s.tik(leeg(600)), "balk-stop");
  assert.equal(s.tik(leeg(3000)), "ok");
  assert.equal(s.tik(leeg(9999)), "ok");
  assert.equal(s.tik(leeg(10000)), "nudge");
  assert.equal(s.tik(leeg(12999)), "ok");
  assert.equal(s.tik(leeg(13000)), "herlaad");
  assert.equal(s.tik(leeg(13300)), "ok");
  assert.equal(s.tik(leeg(22999)), "ok");
  assert.equal(s.tik(leeg(23000)), "nudge");
  assert.equal(s.tik(leeg(26000)), "herlaad");
});
t("readyState of voldoende buffer maakt herstel na drie seconden mogelijk", () => {
  for (const data of [{ bufferVooruit: 0, readyState: 3 }, { bufferVooruit: 1, readyState: 2 }]) {
    const s = new Stall();
    s.tik({ ...invoer(0), ...data });
    assert.equal(s.tik({ ...invoer(3000), ...data }), "nudge");
    assert.equal(s.tik({ ...invoer(6000), ...data }), "herlaad");
    assert.equal(s.tik({ ...invoer(6300), ...data }), "ok");
  }
});
t("data die tijdens wachten aankomt maakt eerder herstel mogelijk", () => {
  const s = new Stall();
  s.tik({ ...invoer(0), bufferVooruit: 0 });
  assert.equal(s.tik({ ...invoer(3000), bufferVooruit: 0 }), "balk-stop");
  assert.equal(s.tik(invoer(4000)), "nudge");
});
t("herladen wacht wanneer de laadstatus vooruitgaat", () => {
  const s = new Stall();
  const laden = (now: number, readyState: number) => ({ ...invoer(now), bufferVooruit: 0, networkState: 2, readyState });
  s.tik(laden(0, 0));
  assert.equal(s.tik(laden(10000, 0)), "nudge");
  assert.equal(s.tik(laden(13000, 1)), "ok");
  assert.equal(s.tik(laden(13300, 2)), "ok");
  assert.equal(s.tik(laden(13600, 2)), "herlaad");
});
t("tijdgrenzen voor balk, herstel en herladen zijn inclusief", () => {
  const s = new Stall();
  assert.equal(s.tik(invoer(0)), "ok");
  assert.equal(s.tik(invoer(599)), "ok");
  assert.equal(s.tik(invoer(600)), "balk-stop");
  assert.equal(s.tik(invoer(2999)), "ok");
  assert.equal(s.tik(invoer(3000)), "nudge");
  assert.equal(s.tik(invoer(5999)), "ok");
  assert.equal(s.tik(invoer(6000)), "herlaad");
});
t("minimale beweging en balkafwijking overschrijden pas na de grens", () => {
  const s = new Stall();
  s.tik(invoer(0, 0));
  assert.equal(s.tik(invoer(100, 0.001)), "ok");
  assert.equal(s.tik({ ...invoer(200, 0.002), balkTijd: 0.302 }), "ok");
  assert.equal(s.tik({ ...invoer(300, 0.004), balkTijd: 0.305 }), "balk-sync");
});
t("een gewone seek wist een lopende herstelpoging", () => {
  const s = new Stall();
  s.tik(invoer(0));
  assert.equal(s.tik(invoer(3000)), "nudge");
  assert.equal(s.tik({ ...invoer(4000), seeking: true }), "ok");
  assert.equal(s.tik(invoer(6000)), "ok");
  assert.equal(s.tik(invoer(8999)), "balk-stop");
  assert.equal(s.tik(invoer(9000)), "nudge");
});
