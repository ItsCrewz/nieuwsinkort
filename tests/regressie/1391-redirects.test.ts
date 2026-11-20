import assert from "node:assert/strict";
import { externeFetch } from "../../worker/src/url";

const origineel = globalThis.fetch;
const start = "https://nos.nl/artikel/1";
const signaal = new AbortController().signal;
let aanvragen: string[] = [], gesloten = 0;
const redirect = (locatie?: string) => new Response(new ReadableStream({ cancel() { gesloten++; } }), {
  status: 302, headers: locatie === undefined ? {} : { Location: locatie },
});
try {
  let antwoorden: Response[] = [];
  globalThis.fetch = async (url, init) => {
    aanvragen.push(String(url));
    assert.equal(init?.redirect, "manual");
    assert.equal(init?.signal, signaal);
    return antwoorden.shift()!;
  };
  const probeer = async (rij: Response[]) => {
    aanvragen = []; gesloten = 0; antwoorden = rij;
    return externeFetch(start, { signal: signaal, redirect: "follow" });
  };
  const eind = new Response("artikel");
  assert.equal(await (await probeer([redirect("/artikel/2"), redirect("https://www.nu.nl/nieuws"), eind])).text(), "artikel");
  assert.deepEqual(aanvragen, [start, "https://nos.nl/artikel/2", "https://www.nu.nl/nieuws"]);
  assert.equal(gesloten, 2);
  for (const doel of ["http://127.0.0.1/", "http://dienst.internal/", "javascript:alert(1)", "http://[", "", undefined]) {
    await assert.rejects(probeer([redirect("/artikel/2"), redirect(doel)]), /redirect-URL/);
    assert.deepEqual(aanvragen, [start, "https://nos.nl/artikel/2"]);
    assert.equal(gesloten, 2);
  }
  await assert.rejects(probeer([redirect("/artikel/2"), redirect("/artikel/1")]), /redirectlus/);
  assert.equal(aanvragen.length, 2);
  assert.equal(gesloten, 2);
  await assert.rejects(probeer(Array.from({ length: 11 }, (_, i) => redirect(`/artikel/${i + 2}`))), /te veel redirects/);
  assert.equal(aanvragen.length, 11);
  assert.equal(gesloten, 11);
} finally { globalThis.fetch = origineel; }
console.log("✓ redirects vooraf gecontroleerd en bodies gesloten");
