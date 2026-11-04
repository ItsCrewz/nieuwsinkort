import { strict as assert } from "node:assert";
import { ytVerwijderBesluit } from "../src/ytstart";

assert.deepEqual(ytVerwijderBesluit(150, 2, 2, 4, -1), { verwijder: true, actief: 1 });
assert.deepEqual(ytVerwijderBesluit(5, 2, 2, 4, -1), { verwijder: false, actief: 2 });
assert.deepEqual(ytVerwijderBesluit(150, 2, 2, 4, 1), { verwijder: true, actief: 2 });
assert.deepEqual(ytVerwijderBesluit(150, 1, 2, 4, -1), { verwijder: true, actief: 1 });
assert.deepEqual(ytVerwijderBesluit(150, 3, 2, 4, 1), { verwijder: true, actief: 2 });
assert.deepEqual(ytVerwijderBesluit(150, 0, 0, 4, -1), { verwijder: false, actief: 0 });
