import assert from "node:assert/strict";
import { dumpertRoute } from "../src/dumpertroute";

const basis = { src: "https://media.dumpert.nl/video/index.m3u8", nativeHls: true, fout: false, msSindsStart: 0, heeftFrame: false, alGewisseld: false };
assert.equal(dumpertRoute(basis), "direct");
assert.equal(dumpertRoute({ ...basis, fout: true }), "proxy");
assert.equal(dumpertRoute({ ...basis, msSindsStart: 3999 }), "direct");
assert.equal(dumpertRoute({ ...basis, msSindsStart: 4000 }), "proxy");
assert.equal(dumpertRoute({ ...basis, msSindsStart: 4000, heeftFrame: true }), "direct");
assert.equal(dumpertRoute({ ...basis, alGewisseld: true, heeftFrame: true }), "proxy");
assert.equal(dumpertRoute({ ...basis, nativeHls: false }), "proxy");
assert.equal(dumpertRoute({ ...basis, src: "https://voorbeeld.nl/index.m3u8", nativeHls: false, fout: true }), "direct");
assert.equal(dumpertRoute({ ...basis, src: "https://media.dumpert.nl.voorbeeld.nl/index.m3u8", fout: true }), "direct");
console.log("✓ Dumpert-route en eenmalige terugval");
