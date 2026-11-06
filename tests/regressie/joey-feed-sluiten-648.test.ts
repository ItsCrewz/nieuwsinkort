// #648: de videofeed voerde onClose twee keer uit (sluittimer én animationend, dubbel tikken, herhaald Escape),
// waardoor bij een intern geopende feed twee keer history.back() liep en de gebruiker te ver terugging.
import assert from "node:assert/strict";
import { maakFeedNavigatie, maakSluiter } from "../../src/feedsluiten";

type Taak = { id: number; f: () => void; ms: number };
function nep(rustig = false) {
  const taken: Taak[] = [];
  const wissen: number[] = [];
  let teller = 0, gesloten = 0, animatie = 0;
  const s = maakSluiter({
    rustig: () => rustig,
    onClose: () => { gesloten++; },
    start: () => { animatie++; },
    zet: (f, ms) => { taken.push({ id: ++teller, f, ms }); return teller; },
    wis: (id) => { wissen.push(id); const i = taken.findIndex((t) => t.id === id); if (i >= 0) taken.splice(i, 1); },
  });
  return { s, taken, wissen, get gesloten() { return gesloten; }, get animatie() { return animatie; } };
}

// Dubbel tikken en herhaald Escape: één timer, één onClose.
{
  const t = nep();
  t.s.sluit(); t.s.sluit(); t.s.sluit();
  assert.equal(t.taken.length, 1);
  assert.equal(t.taken[0].ms, 220);
  assert.equal(t.animatie, 1);
  t.taken[0].f();
  assert.equal(t.gesloten, 1);
  t.s.sluit();
  assert.equal(t.gesloten, 1);
}
// animationend vóór de timer: timer wordt opgeruimd; een late timer doet niets extra.
{
  const t = nep();
  t.s.sluit();
  const late = t.taken[0].f;
  t.s.rondAf();
  assert.equal(t.gesloten, 1);
  assert.equal(t.taken.length, 0);
  assert.deepEqual(t.wissen, [1]);
  late();
  t.s.rondAf();
  assert.equal(t.gesloten, 1);
}
// Feed verdwijnt tijdens de animatie: timer weg, onClose nooit.
{
  const t = nep();
  t.s.sluit();
  t.s.opruimen();
  assert.equal(t.taken.length, 0);
  assert.equal(t.gesloten, 0);
}
// Reduced motion: direct sluiten, geen animatie, geen timer, ook niet dubbel.
{
  const t = nep(true);
  t.s.sluit(); t.s.sluit();
  assert.equal(t.gesloten, 1);
  assert.equal(t.animatie, 0);
  assert.equal(t.taken.length, 0);
}

// Beide routes: intern geopend = één history.back(); directe videolink = één replace naar het overzicht.
function venster() {
  const log: string[] = [];
  return { log, w: { location: { pathname: "/", search: "?x=1", replace: (u: string) => log.push(`replace ${u}`) }, history: { back: () => log.push("back") } } };
}
for (const [intern, verwacht] of [[true, ["back"]], [false, ["replace /?x=1#/dumpert"]]] as const) {
  const { log, w } = venster();
  const nav = maakFeedNavigatie(w);
  nav.geopend(intern);
  const t = nep();
  const s = maakSluiter({ rustig: () => false, onClose: () => nav.sluit("dumpert"), start: () => {}, zet: (f) => (t.taken.push({ id: 1, f, ms: 220 }), 1), wis: () => {} });
  s.sluit(); s.sluit();
  t.taken[0].f(); s.rondAf(); t.taken[0].f();
  assert.deepEqual(log, verwacht);
}
console.log("Feed sluiten (#648): één keer onClose, timeropruiming, reduced motion en beide sluitroutes geslaagd");
