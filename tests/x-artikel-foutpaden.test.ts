import assert from "node:assert/strict";
import { xFx, xSyndication, xPosts } from "../worker/src/x";
import { artikelTekst, jinaTekst } from "../worker/src/artikel";

const oudeFetch = globalThis.fetch;
const antwoord = (body: string, status = 200) => new Response(body, { status });
const next = (data: unknown) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
try {
  globalThis.fetch = (async () => antwoord("", 503)) as typeof fetch;
  await assert.rejects(xFx("nieuws"), /fxtwitter HTTP 503/);
  await assert.rejects(xSyndication("nieuws"), /syndication HTTP 503/);

  globalThis.fetch = (async () => antwoord("")) as typeof fetch;
  await assert.rejects(xFx("nieuws"), SyntaxError);
  await assert.rejects(xSyndication("nieuws"), /syndication: geen data/);
  globalThis.fetch = (async () => antwoord("geen json")) as typeof fetch;
  await assert.rejects(xFx("nieuws"), SyntaxError);
  globalThis.fetch = (async () => antwoord('{"code":200}')) as typeof fetch;
  assert.deepEqual(await xFx("nieuws"), []);
  globalThis.fetch = (async () => antwoord('{}')) as typeof fetch;
  await assert.rejects(xFx("nieuws"), /fxtwitter \?/);
  globalThis.fetch = (async () => antwoord('{"code":200,"results":[{},null]}')) as typeof fetch;
  assert.deepEqual(await xFx("nieuws"), []);

  globalThis.fetch = (async () => antwoord('<script id="__NEXT_DATA__" type="application/json">ongeldig</script>')) as typeof fetch;
  await assert.rejects(xSyndication("nieuws"), SyntaxError);
  globalThis.fetch = (async () => antwoord(next({}))) as typeof fetch;
  assert.deepEqual(await xSyndication("nieuws"), []);
  globalThis.fetch = (async () => antwoord(next({ props: { pageProps: { timeline: { entries: [{}, { content: { tweet: {} } }] } } } }))) as typeof fetch;
  assert.deepEqual(await xSyndication("nieuws"), []);

  let verzoeken = 0;
  globalThis.fetch = (async () => ++verzoeken === 1 ? antwoord("", 502) : antwoord(next({}))) as typeof fetch;
  assert.deepEqual(await xPosts("nieuws"), { posts: [], via: "syndication", err: "fxtwitter HTTP 502" });
  verzoeken = 0;
  globalThis.fetch = (async () => { verzoeken++; return antwoord("", 503); }) as typeof fetch;
  await assert.rejects(xPosts("nieuws"), /fxtwitter HTTP 503; syndication HTTP 503/);
  assert.equal(verzoeken, 2);
} finally {
  globalThis.fetch = oudeFetch;
}

const alinea = "De gemeente onderzoekt hoe bewoners samen meer ruimte kunnen krijgen voor groene bomen en veilige straten in hun buurt.";
assert.deepEqual(artikelTekst(""), []);
assert.deepEqual(artikelTekst("<article><p>onvolledige html"), []);
assert.deepEqual(artikelTekst('<script type="application/ld+json">{ongeldig}</script>'), []);
assert.deepEqual(artikelTekst('<script type="application/ld+json">{"@graph":[{},null]}</script>'), []);
assert.deepEqual(artikelTekst(`<script type="application/ld+json">{ongeldig}</script><p>${alinea}</p>`), [alinea]);
assert.deepEqual(artikelTekst("<article><p>Kort bericht.</p></article>"), []);
assert.deepEqual(jinaTekst(""), []);
assert.deepEqual(jinaTekst("Titel\nMarkdown Content:\n\n![foto](ongeldig)\n\nKort bericht."), []);
console.log("✓ x-artikel-foutpaden");
