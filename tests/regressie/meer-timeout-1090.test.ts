import assert from "node:assert/strict";
import { prefetchMeer } from "../../src/meer";
import type { Item } from "../../src/types";

const fetchEcht = globalThis.fetch, timeoutEcht = globalThis.setTimeout, clearEcht = globalThis.clearTimeout;
let aflopen: () => void = () => {};
let oudAfronden: (v: unknown) => void = () => {};
let signaal: AbortSignal | null | undefined;
let aantal = 0;
const item = { meer: "regressie-1090" } as Item;
const oud = { uitleg: ["Oude tekst"] }, nieuw = { uitleg: ["Nieuwe tekst"] };
try {
  globalThis.setTimeout = ((fn: () => void) => { aflopen = fn; return 1; }) as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    aantal++;
    signaal = init?.signal;
    if (aantal === 1) return Promise.resolve({ ok: true, json: () => new Promise((resolve) => { oudAfronden = resolve; }) } as Response);
    return Promise.resolve(Response.json(nieuw));
  }) as typeof fetch;
  const eerste = prefetchMeer(item);
  assert.equal(prefetchMeer(item), eerste);
  await Promise.resolve(); // headers zijn binnen, de inhoud blijft hangen
  aflopen();
  assert.equal(await eerste, null);
  assert.equal(signaal?.aborted, true);
  const tweede = prefetchMeer(item);
  assert.equal(prefetchMeer(item), tweede);
  assert.deepEqual(await tweede, nieuw);
  oudAfronden(oud);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(await prefetchMeer(item), nieuw);
  assert.equal(aantal, 2);
  console.log("ok - timeout tijdens lezen, herstel en laat antwoord");

  for (const fout of ["afgewezen", "niet-ok"]) {
    let pogingen = 0;
    const foutItem = { meer: `regressie-1090-${fout}` } as Item;
    globalThis.fetch = (() => {
      pogingen++;
      if (pogingen === 1) return fout === "afgewezen"
        ? Promise.reject(new Error("netwerkfout"))
        : Promise.resolve(new Response(null, { status: 503 }));
      return Promise.resolve(Response.json(nieuw));
    }) as typeof fetch;
    assert.equal(await prefetchMeer(foutItem), null);
    assert.deepEqual(await prefetchMeer(foutItem), nieuw);
    assert.equal(pogingen, 2);
  }
  console.log("ok - opnieuw proberen na netwerkfout en niet-OK-respons");
} finally {
  globalThis.fetch = fetchEcht;
  globalThis.setTimeout = timeoutEcht;
  globalThis.clearTimeout = clearEcht;
}
