import assert from "node:assert/strict";
import { prefetchMeer } from "../../src/meer";
import type { Item } from "../../src/types";

const echteFetch = globalThis.fetch;
const echteTimeout = globalThis.setTimeout;
const echteClear = globalThis.clearTimeout;
let aflopen: (() => void) | undefined;
let signaal: AbortSignal | undefined;
let afronden: ((r: Response) => void) | undefined;
let aantal = 0;
const item = { meer: "regressie-742" } as Item;
const antwoord = { uitleg: ["Extra artikeltekst"] };

globalThis.setTimeout = ((fn: () => void) => { aflopen = fn; return 1; }) as typeof setTimeout;
globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
  aantal++;
  signaal = init?.signal ?? undefined;
  return new Promise<Response>((resolve) => { afronden = resolve; });
}) as typeof fetch;
try {
  const eerste = prefetchMeer(item);
  assert.equal(prefetchMeer(item), eerste);
  assert.equal(aantal, 1);
  const oudAfronden = afronden!;
  aflopen!();
  assert.equal(await eerste, null);
  assert.equal(signaal?.aborted, true);

  const tweede = prefetchMeer(item);
  assert.equal(prefetchMeer(item), tweede);
  assert.equal(aantal, 2);
  oudAfronden(Response.json(antwoord));
  await Promise.resolve();
  assert.equal(prefetchMeer(item), tweede, "oude afloop verwijdert de nieuwe aanvraag niet");
  afronden!(Response.json(antwoord));
  assert.deepEqual(await tweede, antwoord);
  assert.deepEqual(await prefetchMeer(item), antwoord);
  assert.equal(aantal, 2);
  console.log("ok - vastgelopen aanvraag herstelt en succesvolle aanvraag blijft gedeeld");
} finally {
  globalThis.fetch = echteFetch;
  globalThis.setTimeout = echteTimeout;
  globalThis.clearTimeout = echteClear;
}
