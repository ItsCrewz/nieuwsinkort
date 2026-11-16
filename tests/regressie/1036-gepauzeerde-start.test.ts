import assert from "node:assert/strict";
import { ytStartBesluit, ytToonHint } from "../../src/ytstart";

// Een actieve YouTube-video zonder startmelding, voor en na bewust pauzeren.
const start = { actief: true, gepauzeerd: false, klaar: true, status: -1, pogingen: 0, sinds: 1000, nu: 1000 };
assert.equal(ytStartBesluit(start), "probeer");
const pauze = { ...start, gepauzeerd: true, nu: 2500 };
assert.equal(ytToonHint(pauze), false);
assert.equal(ytStartBesluit(pauze), "wacht");
const hervat = { ...pauze, gepauzeerd: false };
assert.equal(ytToonHint(hervat), true);
assert.equal(ytStartBesluit(hervat), "vangnet");
assert.equal(ytStartBesluit({ ...hervat, gespeeld: true, status: 1 }), "wacht");
