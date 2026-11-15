import assert from "node:assert/strict";
import { uniekeBeelden } from "../../src/beeld";

// Een bericht over brand is geen merkbeeld; varianten blijven ontdubbeld.
const brand = "https://example.nl/nieuws/grote-brand-in-woning.jpg";
const andere = "https://example.nl/nieuws/brand-in-schuur.jpg?width=1200";
assert.deepEqual(uniekeBeelden([
  brand,
  "https://example.nl/nieuws/grote-brand-in-woning.jpg?width=1200",
  "https://example.nl/assets/brand-logo.png",
  "https://example.nl/media/brandlogo_v2.png",
  "https://example.nl/img/brands/acme.png",
  "https://example.nl/img/brand/acme.png",
  "https://example.nl/static/brandmark.png",
  "https://example.nl/uploads/brand-watermark.png",
  "https://example.nl/assets/brand-asset.png",
  "https://example.nl/assets/brand_kit.png",
  "https://example.nl/assets/placeholder.jpg",
  andere,
  "https://example.nl/nieuws/brand-in-schuur.jpg?width=800",
]), [brand, andere]);
