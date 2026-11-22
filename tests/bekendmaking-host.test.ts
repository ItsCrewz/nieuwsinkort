import assert from "node:assert/strict";
import { bekendmakingFallback, isOfficieleHost, toonBekendmaking } from "../src/bekendmaking";

const item = (site: string, href: string) => ({ ruw: true, ai: "", samenvatting: "", bronnen: [{ site, href }] });
const geldig = ["https://officielebekendmakingen.nl/stcrt-1", "https://zoek.officielebekendmakingen.nl/x", "HTTPS://OfficieleBekendmakingen.NL:443/x?y=1", "https://officielebekendmakingen.nl./x", "http://officielebekendmakingen.nl"];
const misleidend = ["https://evil.example/officielebekendmakingen.nl/x", "https://evil.example/?u=officielebekendmakingen.nl", "https://officielebekendmakingen.nl.evil.example/x", "https://xofficielebekendmakingen.nl/x", "https://officielebekendmakingen.nl@evil.example/x", "javascript:officielebekendmakingen.nl", "officielebekendmakingen.nl/x", "/officielebekendmakingen.nl", "geen url", ""];

for (const h of geldig) {
  assert.equal(isOfficieleHost(h), true, h);
  assert.equal(toonBekendmaking(item("Gemeente", h)).ai, bekendmakingFallback, h);
}
for (const h of misleidend) {
  assert.equal(isOfficieleHost(h), false, h);
  const i = item("Gemeente", h);
  assert.equal(toonBekendmaking(i), i, h);
}
assert.equal(toonBekendmaking(item("Officiële Bekendmakingen", "https://evil.example/x")).ai, bekendmakingFallback);
assert.equal(toonBekendmaking(item("Officiële Bekendmakingen", "geen url")).ai, bekendmakingFallback);
console.log("ok");
