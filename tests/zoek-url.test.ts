import assert from "node:assert/strict";
import { leesZoekterm, schrijfZoekterm } from "../src/zoek";

assert.equal(leesZoekterm("?q="), "");
assert.equal(leesZoekterm("?nietmeten=1"), "");
const url = schrijfZoekterm("https://voorbeeld.nl/?nietmeten=1&ander=ja#/alles", "café & nieuws/+😀");
const parsed = new URL(url, "https://voorbeeld.nl");
assert.equal(leesZoekterm(parsed.search), "café & nieuws/+😀");
assert.equal(parsed.searchParams.get("nietmeten"), "1");
assert.equal(parsed.searchParams.get("ander"), "ja");
assert.equal(parsed.hash, "#/alles");
assert.equal(schrijfZoekterm(parsed.href, ""), "/?nietmeten=1&ander=ja#/alles");
