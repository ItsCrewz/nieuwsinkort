import assert from "node:assert/strict";
import { leesZoekterm, schrijfZoekterm } from "../src/zoekurl";

assert.equal(leesZoekterm(""), "");
assert.equal(leesZoekterm("?q="), "");
assert.equal(leesZoekterm("?nietmeten=1&q=caf%C3%A9+%26+nieuws"), "café & nieuws");
assert.equal(schrijfZoekterm("https://voorbeeld.nl/?nietmeten=1&ander=ja#/alles", "café & nieuws"), "/?nietmeten=1&ander=ja&q=caf%C3%A9+%26+nieuws#/alles");
assert.equal(schrijfZoekterm("https://voorbeeld.nl/?q=oud&nietmeten=1#/alles", ""), "/?nietmeten=1#/alles");
console.log("zoekurl: tests geslaagd");
