import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { zetNepDom } from "../hulp/nepdom";

const fixture = JSON.parse(readFileSync("public/data.json", "utf8"));
const dom = zetNepDom({ "/bronnen.json": { groepen: [] } });
const { createRoot } = await import("react-dom/client");
const { useData } = await import("../../src/App");
const echteTimeout = globalThis.setTimeout;
const timers: Array<() => void> = [];
globalThis.setTimeout = ((fn: () => void, ms?: number) => ms === 8000 ? (timers.push(fn), timers.length as unknown as ReturnType<typeof setTimeout>) : echteTimeout(fn, ms)) as typeof setTimeout;
const uitgesteld = <T>() => {
  let los!: (waarde: T) => void;
  const promise = new Promise<T>((resolve) => { los = resolve; });
  return { promise, los };
};
const vroeg = uitgesteld<Response>();
(window as any).__vroegData = vroeg.promise;
const aanvragen: Array<ReturnType<typeof uitgesteld<Response>>> = [];
globalThis.fetch = (() => { const p = uitgesteld<Response>(); aanvragen.push(p); return p.promise; }) as typeof fetch;
let toestand!: ReturnType<typeof useData>;
function Proef() { toestand = useData(); return null; }
const root = createRoot(dom.container as unknown as Element);
const doorspoelen = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
try {
  await act(async () => { root.render(createElement(Proef)); await doorspoelen(); });
  await act(async () => { timers[0](); await doorspoelen(); });
  await act(async () => { timers[1](); await doorspoelen(); });
  await act(async () => { timers[2](); await doorspoelen(); });
  assert.equal(toestand.error, true, "na drie verlopen pogingen verschijnt de fouttoestand");
  assert.equal(aanvragen.length, 2);
  await act(async () => { void toestand.reload(); await doorspoelen(); });
  const nieuw = { ...fixture, gegenereerd: new Date().toISOString(), dag_samenvatting: "Nieuwe gegevens" };
  await act(async () => { aanvragen[2].los(Response.json(nieuw)); await doorspoelen(); });
  assert.equal(toestand.error, false);
  assert.equal(toestand.data?.dag_samenvatting, "Nieuwe gegevens");
  await act(async () => {
    vroeg.los(Response.json({ ...nieuw, dag_samenvatting: "Oude gegevens" }));
    aanvragen[0].los(Response.json({ ...nieuw, dag_samenvatting: "Oude gegevens" }));
    aanvragen[1].los(Response.json({ ...nieuw, dag_samenvatting: "Oude gegevens" }));
    await doorspoelen();
  });
  assert.equal(toestand.data?.dag_samenvatting, "Nieuwe gegevens");
} finally {
  await act(async () => root.unmount());
  globalThis.setTimeout = echteTimeout;
}
console.log("✓ vastgelopen laden, opnieuw proberen en late antwoorden");
