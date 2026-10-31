import assert from "node:assert/strict";
import { viewTitel } from "../src/route";
import { CATS } from "../src/tabs";

assert.equal(viewTitel("alles"), "Nieuws in het kort");
for (const cat of CATS) assert.equal(viewTitel(cat.id), `${cat.label} · Nieuws in het kort`);
assert.equal(viewTitel("filmpjes"), "Filmpjes · Nieuws in het kort");
assert.equal(viewTitel("dumpert"), "Dumpert · Nieuws in het kort");
