import { strict as assert } from "node:assert";
import { markeerDelen, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

for (const [elisie, zoekterm] of [["zo'n", "zon"], ["z’n", "zn"], ["d'r", "dr"], ["m'n", "mn"]]) {
  const item = { cat: "nl", kop: `Er zijn ${elisie} 200.000 auto's verkocht` } as Item;
  assert.deepEqual(zoekItems([item], zoekterm), []);
  assert.deepEqual(markeerDelen(item.kop!, zoekterm), [{ tekst: item.kop!, markeer: false }]);
}

const naam = { cat: "nl", kop: "Jose\u0301’Neill wint" } as Item;
assert.deepEqual(zoekItems([naam], "joseneill"), [naam]);
assert.deepEqual(markeerDelen(naam.kop!, "joseneill"), [{ tekst: "Jose\u0301’Neill", markeer: true }, { tekst: " wint", markeer: false }]);
assert.equal(zoekItems([{ cat: "nl", kop: "rock'n'roll" } as Item], "rocknroll").length, 1);
