import assert from "node:assert/strict";
import { uniekeBeelden } from "../../src/beeld";

const fotos = [
  "https://example.org/news/small-business.jpg",
  "https://example.org/news/report-small-business.jpg",
];
assert.deepEqual(uniekeBeelden([...fotos, "https://example.org/news/report-small.jpg"]), fotos);
