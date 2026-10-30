import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { readFileSync } from "node:fs";
import { AiVermelding, isAiSamenvatting, isAiUitgebreid } from "../src/ai-vermelding";
import type { Item, Meer } from "../src/types";

const item: Item = { cat: "nl", kop: "Nieuws", ai: "Kort nieuws", samenvatting: "Meer nieuws", punten: [], tijd: "12:00", bronnen: [] };
assert.equal(isAiSamenvatting(item), true);
assert.equal(isAiSamenvatting({ ...item, ruw: true }), false);
assert.equal(isAiSamenvatting({ ...item, ai: "", samenvatting: "" }), false);
assert.match(renderToStaticMarkup(createElement(AiVermelding, { tonen: true })), /Samenvatting gemaakt met AI/);
assert.equal(renderToStaticMarkup(createElement(AiVermelding, { tonen: false })), "");
const app = readFileSync("src/App.tsx", "utf8");
assert.match(app, /aria-label="Uitgebreid"[\s\S]*?<AiVermelding tonen=\{isAiUitgebreid\(item, meer\)\}/);
assert.equal(isAiUitgebreid(item, { uittreksel: [{ alineas: ["Brontekst"] }] } as Meer), false);
assert.equal(isAiUitgebreid({ ...item, ruw: true }, { uitleg: ["AI-uitleg"] } as Meer), true);
assert.ok(app.includes("Samenvattingen op nieuwsinkort worden gemaakt met AI en kunnen fouten bevatten. Lees bij twijfel altijd de bron."));
