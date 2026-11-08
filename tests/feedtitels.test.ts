import assert from "node:assert/strict";
import { geselecteerd, nieuwsRubriek } from "../scripts/feedtitels-selectie";

for (const cat of ["nl", "buitenland", "haarlem", "tech", "politiek", "voetbal", "f1", "auto"]) assert.equal(geselecteerd(cat), true, cat);
for (const cat of ["filmpjes", "dumpert", "youtube", "instagram", "reddit", "podcast"]) assert.equal(geselecteerd(cat), false, cat);
for (const cat of ["voetbal", "f1", "auto", "buitenland"]) assert.equal(nieuwsRubriek(cat, "https://voorbeeld.nl/feed", "https://voorbeeld.nl/bericht", "Nieuws", ""), cat);
assert.equal(nieuwsRubriek("nl", "https://voorbeeld.nl/buitenland", "https://voorbeeld.nl/bericht", "Nieuws", ""), "buitenland");
assert.equal(nieuwsRubriek("nl", "https://voorbeeld.nl/feed", "https://voorbeeld.nl/buitenland/bericht", "Nieuws", ""), "buitenland");
assert.equal(nieuwsRubriek("nl", "https://voorbeeld.nl/buitenland", "https://voorbeeld.nl/bericht", "Nieuws uit Nederland", ""), "nl");
console.log("feedtitels: rubriekselectie en herindeling ok");
