import assert from "node:assert/strict";
import { soundOn, saveSound } from "../src/geluid";
import { isTouch, volgTouch, TOUCH_QUERIES } from "../src/invoer";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const sleutel = "nieuwsinkort-geluid";
const geblokkeerd = { getItem() { throw Error("geblokkeerd"); }, setItem() { throw Error("geblokkeerd"); } };
function opslag(waarde: string | null = null) {
  return {
    getItem: (k: string) => k === sleutel ? waarde : null,
    setItem: (k: string, v: string) => { if (k === sleutel) waarde = v; },
  };
}
function venster(sessie: unknown, lokaal?: unknown) {
  Object.assign(globalThis, { window: { sessionStorage: sessie, localStorage: lokaal } });
}

t("soundOn valt zonder opslag terug op aan", () => {
  venster(undefined);
  assert.equal(soundOn(), true);
  venster(geblokkeerd, geblokkeerd);
  assert.equal(soundOn(), true);
});
t("soundOn leest beschikbare opslag als de andere ontbreekt of faalt", () => {
  venster(opslag("0"));
  assert.equal(soundOn(), false);
  venster(geblokkeerd, opslag("1"));
  assert.equal(soundOn(), true);
  venster(opslag(), geblokkeerd);
  assert.equal(soundOn(), true);
});
t("saveSound bewaart de keuze zonder localStorage", () => {
  const sessie = opslag();
  venster(sessie);
  saveSound(false);
  assert.equal(sessie.getItem(sleutel), "0");
  assert.equal(soundOn(), false);
  saveSound(true);
  assert.equal(sessie.getItem(sleutel), "1");
  assert.equal(soundOn(), true);
});
t("saveSound bewaart de keuze bij geblokkeerde opslag", () => {
  venster(geblokkeerd, geblokkeerd);
  saveSound(false);
  assert.equal(soundOn(), false);
  const lokaal = opslag();
  venster(geblokkeerd, lokaal);
  saveSound(true);
  assert.equal(lokaal.getItem(sleutel), "1");
  assert.equal(soundOn(), true);
  venster(undefined);
  saveSound(false);
  assert.equal(soundOn(), false);
});

t("zonder matchMedia of met lege resultaten is er geen touch", () => {
  assert.equal(isTouch(null), false);
  assert.equal(isTouch(() => null), false);
  let aangeroepen = false;
  const stop = volgTouch(null, () => { aangeroepen = true; });
  stop();
  assert.equal(aangeroepen, false);
});
t("oude Safari zonder addEventListener registreert geen wijzigingen", () => {
  const queries: string[] = [];
  let oudeRegistraties = 0;
  let oudeAfmeldingen = 0;
  let meldingen = 0;
  const mm = (q: string) => {
    queries.push(q);
    return {
      matches: q === "(hover: none)",
      addListener: () => { oudeRegistraties++; },
      removeListener: () => { oudeAfmeldingen++; },
    } as unknown as MediaQueryList;
  };
  assert.equal(isTouch(mm), true);
  queries.length = 0;
  const stop = volgTouch(mm, () => { meldingen++; });
  assert.deepEqual(queries, [...TOUCH_QUERIES]);
  stop();
  assert.equal(oudeRegistraties, 0);
  assert.equal(oudeAfmeldingen, 0);
  assert.equal(meldingen, 0);
});
t("afmelden verwijdert beide luisteraars en stopt meldingen", () => {
  const actief = new Set<string>();
  const luisteraars = new Map<string, Set<() => void>>();
  const mm = (q: string) => ({
    get matches() { return actief.has(q); },
    addEventListener: (soort: string, fn: () => void) => {
      assert.equal(soort, "change");
      const set = luisteraars.get(q) ?? new Set<() => void>();
      set.add(fn);
      luisteraars.set(q, set);
    },
    removeEventListener: (soort: string, fn: () => void) => {
      assert.equal(soort, "change");
      assert.equal(luisteraars.get(q)?.delete(fn), true);
    },
  }) as unknown as MediaQueryList;
  const meldingen: boolean[] = [];
  const stop = volgTouch(mm, (waarde) => meldingen.push(waarde));
  assert.deepEqual([...luisteraars.keys()], [...TOUCH_QUERIES]);
  actief.add("(pointer: coarse)");
  luisteraars.get("(pointer: coarse)")?.forEach((fn) => fn());
  assert.deepEqual(meldingen, [true]);
  stop();
  assert.deepEqual([...luisteraars.values()].map((set) => set.size), [0, 0]);
  actief.clear();
  luisteraars.get("(hover: none)")?.forEach((fn) => fn());
  assert.deepEqual(meldingen, [true]);
});