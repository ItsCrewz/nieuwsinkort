// De voorbeelden worden lokaal gecontroleerd, zonder netwerkverzoeken.
import assert from "node:assert/strict";
import { uniekeBeelden } from "../../src/beeld";
import { beeldViaProxy } from "../../src/beeldhost";

const http = "http://voorbeeld.invalid/nieuws/foto.jpg";
const https = "https://images.nu.nl/m/voorbeeld/foto.jpg";
assert.deepEqual(uniekeBeelden([http, https]), [https]);
assert.deepEqual(uniekeBeelden([http, "https://voorbeeld.invalid/nieuws/foto.jpg"]), ["https://voorbeeld.invalid/nieuws/foto.jpg"]);
assert.equal(beeldViaProxy(https), "/media/beeld/images.nu.nl/m/voorbeeld/foto.jpg");
