import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { build }: typeof import("esbuild") = createRequire(`${process.cwd()}/package.json`)("esbuild");
import { readFileSync } from "node:fs";
import type { Item } from "../../src/types";

// Een kleine hook-testomgeving maakt ook de render vóór het effect zichtbaar.
const mock = `
let state, effect, vorige, opruimen;
export function useState(begin) { if (state === undefined) state = begin; return [state, (v) => { state = v; }]; }
export function useEffect(fn, deps) { if (!vorige || deps[0] !== vorige[0]) { effect = fn; vorige = deps; } }
export function effecten() { if (effect) { opruimen?.(); opruimen = effect(); effect = undefined; } }
`;
const bundel = await build({ stdin: { contents: 'export { useMeer } from "./src/usemeer"; export { effecten } from "react";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false, plugins: [{ name: "react-test", setup(b) { b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "test" })); b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: mock, loader: "js" })); } }] });
// Exporteer de effectbesturing uit dezelfde gebundelde React-vervanger.
const code = bundel.outputFiles[0].text;
const { useMeer: renderMeer, effecten } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const [fixture] = JSON.parse(readFileSync("tests/fixtures/joey/punten-ahold-508.json", "utf8")) as Item[];
const item = (meer?: string) => ({ ...fixture, meer, bronnen: [] });
const verzoeken = new Map<string, (r: Response) => void>();
const echteFetch = globalThis.fetch;
globalThis.fetch = ((url: string) => new Promise<Response>((resolve) => verzoeken.set(new URL(url, "https://voorbeeld.nl").searchParams.get("k")!, resolve))) as typeof fetch;
const klaar = async (k: string, tekst: string) => { verzoeken.get(k)!(Response.json({ uitleg: [tekst] })); await new Promise((r) => setTimeout(r, 0)); };
try {
  const a = item("oud-677"), b = item("nieuw-677"), c = item("derde-677");
  renderMeer(a); effecten();
  assert.deepEqual(renderMeer(b), { meer: null, laden: true }); effecten();
  await klaar("nieuw-677", "Nieuwe tekst");
  await klaar("oud-677", "Oude tekst");
  assert.deepEqual(renderMeer(b).meer, { uitleg: ["Nieuwe tekst"] });
  assert.deepEqual(renderMeer(c), { meer: null, laden: true }); effecten();
  await klaar("derde-677", "Derde tekst");
  assert.deepEqual(renderMeer(c).meer, { uitleg: ["Derde tekst"] });
  assert.deepEqual(renderMeer(item()), { meer: null, laden: false });
  console.log("ok - sleutelwisseling tijdens en na laden toont geen oude tekst");
} finally { globalThis.fetch = echteFetch; }
