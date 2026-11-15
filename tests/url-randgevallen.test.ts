import assert from "node:assert/strict";
import { veiligeUrl } from "../src/url";
import { externeUrl } from "../worker/src/url";

let n = 0;
const t = (naam: string, fn: () => void) => {
  fn();
  n++;
  console.log("✓", naam);
};

t("veilige URL geeft de opgeschoonde URL terug", () => {
  for (const [url, verwacht] of [
    [" https://voorbeeld.nl/pad ", "https://voorbeeld.nl/pad"],
    ["\tHTTP://voorbeeld.nl\n", "http://voorbeeld.nl/"],
    ["HtTpS://voorbeeld.nl/", "https://voorbeeld.nl/"],
    ["https://voorbeeld.nl/a?x=1&y=2#deel", "https://voorbeeld.nl/a?x=1&y=2#deel"],
    ["https://bücher.example/pad", "https://xn--bcher-kva.example/pad"],
    ["http://voorbeeld.nl:8080/x", "http://voorbeeld.nl:8080/x"],
  ]) assert.equal(veiligeUrl(url), verwacht, url);
});

t("veilige URL weigert onvolledige of ongeldige http(s)-URL's", () => {
  for (const url of ["https://", "http://", "https:///pad", "https://:80", "https://voor beeld.nl", "https://?x=1", "https://#a"]) {
    assert.equal(veiligeUrl(url), undefined, url);
  }
});

t("bronnenfilter in berichthtml laat bron met kale https:// vallen", () => {
  const bronnen = [{ href: "https://" }, { href: "https://voorbeeld.nl/a?b=1#c" }];
  assert.deepEqual(bronnen.filter((b) => veiligeUrl(b.href)).map((b) => b.href), ["https://voorbeeld.nl/a?b=1#c"]);
});

t("veilige URL weigert ontbrekende invoer en andere schema's", () => {
  for (const url of [undefined, "", "   ", " javascript:alert(1)", "DATA:text/html,tekst", "/relatief", "https ://voorbeeld.nl"]) {
    assert.equal(veiligeUrl(url), undefined, url);
  }
});

t("externe URL accepteert en normaliseert poorten 80 en 443", () => {
  for (const [url, verwacht] of [
    ["HTTP://Voorbeeld.nl:80/pad", "http://voorbeeld.nl/pad"],
    ["https://voorbeeld.nl:443/pad", "https://voorbeeld.nl/pad"],
    ["http://voorbeeld.nl:443/pad", "http://voorbeeld.nl:443/pad"],
    ["https://voorbeeld.nl:80/pad", "https://voorbeeld.nl:80/pad"],
  ]) assert.equal(externeUrl(url), verwacht, url);
});

t("externe URL weigert andere en ongeldige poorten", () => {
  for (const url of ["http://voorbeeld.nl:0/", "https://voorbeeld.nl:81/", "https://voorbeeld.nl:8443/", "http://voorbeeld.nl:65536/", "http://voorbeeld.nl:abc/"]) {
    assert.equal(externeUrl(url), null, url);
  }
});

t("externe URL weigert IPv4, alternatieve IPv4-notaties en IPv6", () => {
  for (const url of ["http://8.8.8.8/", "http://127.1/", "http://0177.0.0.1/", "http://0x7f000001/", "https://[2001:4860:4860::8888]/", "http://[::ffff:127.0.0.1]/"]) {
    assert.equal(externeUrl(url), null, url);
  }
});

t("externe URL weigert lokale en interne hostnamen", () => {
  for (const url of ["http://LOCALHOST/", "http://sub.localhost./", "https://local/", "https://sub.local./", "https://internal/", "https://sub.internal./"]) {
    assert.equal(externeUrl(url), null, url);
  }
});

t("externe URL weigert ongeldige invoer en andere schema's", () => {
  for (const url of ["", "   ", "/relatief", "voorbeeld.nl/pad", "https://", "https://voorbeeld.nl:443:80/", "javascript:alert(1)", "data:text/plain,tekst", "ftp://voorbeeld.nl/"]) {
    assert.equal(externeUrl(url), null, url);
  }
});

t("externe URL accepteert openbare namen die op lokale namen lijken", () => {
  for (const [url, verwacht] of [
    [" https://LOCALHOST.voorbeeld.nl/pad ", "https://localhost.voorbeeld.nl/pad"],
    ["https://localhost-voorbeeld.nl/", "https://localhost-voorbeeld.nl/"],
    ["https://voorbeeld.local.nl/", "https://voorbeeld.local.nl/"],
    ["https://internal-voorbeeld.nl/", "https://internal-voorbeeld.nl/"],
  ]) assert.equal(externeUrl(url), verwacht, url);
});

console.log(`\n${n} tests geslaagd`);