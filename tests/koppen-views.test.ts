import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// Controleer de onderling uitsluitende renderpaden voor laden, detail, nieuws en video.
const bron = readFileSync("src/App.tsx", "utf8");
const laden = bron.slice(bron.indexOf("  if (!data || !raw)"), bron.indexOf("  // Detail: eerst"));
const detail = bron.slice(bron.indexOf("function DetailView"), bron.indexOf("function ", bron.indexOf("function DetailView") + 9));
const nieuws = bron.slice(bron.indexOf("  if (!isVideo) {", bron.indexOf("export default function App")), bron.indexOf('  return (\n    <Frame top={top}>', bron.indexOf("  if (!isVideo) {", bron.indexOf("export default function App"))));
const video = bron.slice(bron.indexOf('  return (\n    <Frame top={top}>', bron.indexOf("  if (!isVideo) {", bron.indexOf("export default function App"))));
for (const [view, pad] of [["laden", laden], ["artikel", detail], ["home en rubrieken", nieuws], ["filmpjes en dumpert", video]]) {
  assert.equal((pad.match(/<h1\b/g) ?? []).length, 1, `${view} heeft één h1`);
}
