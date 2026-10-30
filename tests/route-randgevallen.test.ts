import assert from "node:assert/strict";
import { parseHash, viewHash } from "../src/route";
import type { View } from "../src/types";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const home = { view: "alles", selected: null, video: null };

t("lege hash en alleen een hekje openen home", () => {
  for (const hash of ["", "#", "#/"]) assert.deepEqual(parseHash(hash), home, hash);
});

t("onbekende views vallen terug op home", () => {
  for (const hash of ["#/onbekend", "#/FILMPJES", "#/nederland/extra", "#/bericht"]) {
    assert.deepEqual(parseHash(hash), home, hash);
  }
});

t("gecodeerde rubrieken en slugs worden eenmaal gedecodeerd", () => {
  assert.deepEqual(parseHash("#/neder%6Cand"), { view: "nl", selected: null, video: null });
  assert.deepEqual(parseHash("#/bericht/caf%C3%A9%20%26%20nieuws"), { view: "alles", selected: "café & nieuws", video: null });
  assert.deepEqual(parseHash("#/filmpjes/a%2Fb%2520c"), { view: "filmpjes", selected: null, video: "a/b%20c" });
  assert.deepEqual(parseHash("#/dumpert%2Fvideo"), { view: "dumpert", selected: null, video: "video" });
  assert.throws(() => parseHash("#/bericht/%E0%A4%A"), URIError);
});

t("dubbele en afsluitende slashes blijven onderdeel van het huidige routegedrag", () => {
  for (const hash of ["#//nederland", "#/nederland/", "#/filmpjes/", "#/dumpert/"]) {
    assert.deepEqual(parseHash(hash), home, hash);
  }
  assert.deepEqual(parseHash("#/bericht/"), { view: "alles", selected: "", video: null });
  assert.deepEqual(parseHash("#/bericht//artikel/"), { view: "alles", selected: "/artikel/", video: null });
  assert.deepEqual(parseHash("#/filmpjes//video/"), { view: "filmpjes", selected: null, video: "/video/" });
  assert.deepEqual(parseHash("#/dumpert//"), { view: "dumpert", selected: null, video: "/" });
});

t("viewHash en parseHash vormen een round-trip voor iedere view", () => {
  const hashes: Record<View, string> = {
    alles: "#/", nl: "#/nederland", buitenland: "#/buitenland", politiek: "#/politiek",
    voetbal: "#/voetbal", f1: "#/formule-1", auto: "#/auto", tech: "#/tech",
    haarlem: "#/haarlem", showbizz: "#/showbizz", filmpjes: "#/filmpjes", dumpert: "#/dumpert",
  };
  for (const [view, hash] of Object.entries(hashes) as [View, string][]) {
    assert.equal(viewHash(view), hash, view);
    assert.deepEqual(parseHash(viewHash(view)), { view, selected: null, video: null }, view);
  }
});