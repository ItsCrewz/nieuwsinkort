import assert from "node:assert/strict";
import { markeerDelen, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const item = (kop: string) => ({ kop, cat: "nl" }) as Item;
const vindt = (kop: string, q: string) => zoekItems([item(kop)], q).length === 1;

assert.ok(vindt("東京都で地震", "東京"));
assert.ok(vindt("大東京都", "東京"));
assert.ok(vindt("私は東京都へ", "東京"));
assert.ok(vindt("中国北京市发布消息", "北京"));
assert.ok(!vindt("大阪府で地震", "東京"));
assert.ok(vindt("katten in huis", "kat"));
assert.ok(!vindt("politiek nieuws", "kat"));
assert.ok(!vindt("Nederlandse politiek", "kat"));
assert.ok(!vindt("kopen 20240", "2024"));
const delen = markeerDelen("私は東京都へ", "東京");
assert.deepEqual(delen, [{ tekst: "私は", markeer: false }, { tekst: "東京", markeer: true }, { tekst: "都へ", markeer: false }]);
const t0 = Date.now();
zoekItems([item("東京都".repeat(5000))], "東".repeat(10000));
assert.ok(Date.now() - t0 < 1000);
