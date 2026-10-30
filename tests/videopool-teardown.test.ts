import assert from "node:assert/strict";
import { bronIndexen, maakBronvrij, PoolEigenaars, POOL_GROOTTE, slotVan, type PoolVideo } from "../src/videopool";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };

// DOM-double: logt elke aanroep, zodat de volgorde van teardown en verplaatsen te controleren is.
type Nep = PoolVideo & { id: number; src: string | null; plek: string; log: string[]; setSrc(s: string): void };
function maakEls(log: string[]): Nep[] {
  return Array.from({ length: POOL_GROOTTE }, (_, id) => {
    const el: Nep = {
      id, src: null, plek: "park", log,
      pause() { log.push(`${id}:pause`); },
      load() { log.push(`${id}:load`); },
      removeAttribute(naam: string) { if (naam === "src") el.src = null; log.push(`${id}:rm-${naam}`); },
      setSrc(s: string) { el.src = s; log.push(`${id}:src`); },
    };
    return el;
  });
}

// Speelt de React-volgorde van NativePlayer na: eerst alle unmount-cleanups (geefVrij, parkeren), dan
// mounts (claim, verplaatsen), dan het koppel-effect (bron zetten) en pas daarna de late passieve cleanups.
function feed(lengte: number) {
  const log: string[] = [];
  const els = maakEls(log);
  const pool = new PoolEigenaars();
  const gens = new Map<number, number>();
  let gemount = new Set<number>();
  const zet = (active: number) => {
    const nieuw = bronIndexen(active, lengte);
    const weg = [...gemount].filter((i) => !nieuw.has(i));
    const erbij = [...nieuw].filter((i) => !gemount.has(i));
    const laat: (() => void)[] = [];
    for (const i of weg) {
      const slot = slotVan(i), g = gens.get(i)!, el = els[slot];
      pool.geefVrij(slot, g, () => { el.plek = "park"; log.push(`${el.id}:park`); });
      laat.push(() => pool.ruimOp(slot, g));
      gens.delete(i);
    }
    for (const i of erbij) {
      const slot = slotVan(i), el = els[slot];
      const g = pool.claim(slot);
      gens.set(i, g);
      el.plek = `slide${i}`;
      log.push(`${el.id}:move${i}`);
    }
    for (const i of erbij) {
      const slot = slotVan(i), el = els[slot], g = gens.get(i)!;
      const hls = { destroy() { log.push(`${el.id}:hls-destroy`); } };
      pool.zetOpruim(slot, g, () => maakBronvrij(el, i % 2 ? hls : null));
      el.setSrc(`v${i}`);
      el.load();
    }
    laat.forEach((f) => f());
    gemount = nieuw;
  };
  return { log, els, pool, zet };
}

t("maakBronvrij: pauze, hls.js weg, src weg, load() in die volgorde", () => {
  const log: string[] = [];
  const [el] = maakEls(log);
  el.setSrc("x");
  log.length = 0;
  maakBronvrij(el, { destroy: () => log.push("0:hls-destroy") });
  assert.deepEqual(log, ["0:pause", "0:hls-destroy", "0:rm-src", "0:load"]);
  assert.equal(el.src, null);
});

t("bij wegswipen: eerst bronvrij (pause, src weg, load), dan parkeren; daarna pas een nieuwe bron", () => {
  const f = feed(10);
  f.zet(0);
  f.zet(1);
  f.log.length = 0;
  f.zet(2); // index 1 weg (slot 1), index 3 erbij (slot 0)
  const i = (s: string) => f.log.indexOf(s);
  assert.ok(i("1:pause") >= 0 && i("1:pause") < i("1:hls-destroy"));
  assert.ok(i("1:hls-destroy") < i("1:rm-src") && i("1:rm-src") < i("1:load") && i("1:load") < i("1:park"));
  assert.ok(i("0:move3") < i("0:src"), "bron pas ná plaatsing");
});

t("een element wordt nooit met bron verplaatst", () => {
  const f = feed(30);
  const metBron = new Set<number>();
  f.log.length = 0;
  for (const a of [0, 1, 2, 3, 4, 5, 4, 3, 2, 6, 7, 8, 9, 10, 9, 20, 21, 0]) f.zet(a);
  for (const regel of f.log) {
    const [id, actie] = regel.split(":");
    if (actie === "src") metBron.add(Number(id));
    if (actie === "rm-src") metBron.delete(Number(id));
    if (actie.startsWith("move") || actie === "park") assert.ok(!metBron.has(Number(id)), `${regel} met bron`);
  }
});

t("de voorgeladen buur houdt zijn bron bij activeren", () => {
  const f = feed(10);
  f.zet(4); // 4 actief (slot 1), 5 voorgeladen (slot 2)
  const buur = f.els[slotVan(5)];
  assert.equal(buur.src, "v5");
  f.log.length = 0;
  f.zet(5);
  assert.equal(buur.src, "v5");
  assert.ok(!f.log.some((r) => r.startsWith(`${buur.id}:`)), f.log.join(","));
});

t("altijd precies 3 elementen, hooguit 2 met bron", () => {
  const f = feed(12);
  for (let a = 0; a < 12; a++) {
    f.zet(a);
    assert.equal(f.els.length, 3);
    assert.ok(f.els.filter((e) => e.src).length <= 2);
    assert.deepEqual(f.els.filter((e) => e.src).map((e) => e.src).sort(), [...bronIndexen(a, 12)].map((i) => `v${i}`).sort());
  }
});

t("een oude cleanup raakt een opnieuw toegewezen slot niet", () => {
  const log: string[] = [];
  const [el] = maakEls(log);
  const pool = new PoolEigenaars();
  const oud = pool.claim(0);
  pool.zetOpruim(0, oud, () => maakBronvrij(el));
  const nieuw = pool.claim(0); // ruimt de oude bron synchroon op
  assert.deepEqual(log, ["0:pause", "0:rm-src", "0:load"]);
  pool.zetOpruim(0, nieuw, () => maakBronvrij(el));
  el.setSrc("nieuw");
  log.length = 0;
  assert.equal(pool.ruimOp(0, oud), false);
  assert.equal(pool.geefVrij(0, oud, () => log.push("park")), false);
  assert.equal(pool.zetOpruim(0, oud, () => log.push("oud")), false);
  assert.deepEqual(log, []);
  assert.equal(el.src, "nieuw");
  assert.equal(pool.actueel(0, nieuw), true);
});

t("opruimen gebeurt hooguit één keer", () => {
  const pool = new PoolEigenaars();
  let n = 0;
  const g = pool.claim(2);
  pool.zetOpruim(2, g, () => n++);
  pool.ruimOp(2, g);
  pool.ruimOp(2, g);
  pool.geefVrij(2, g, () => {});
  assert.equal(n, 1);
});
