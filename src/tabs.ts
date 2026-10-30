// Rubrieken (tabs) van het hoofdscherm: volgorde, slugs en het verbergen van lege nieuws-tabs.
import type { Cat, View } from "./types";

export const CATS: { id: Cat; label: string; slug: string }[] = [
  { id: "nl", label: "Nederland", slug: "nederland" },
  { id: "buitenland", label: "Buitenland", slug: "buitenland" },
  { id: "politiek", label: "Politiek", slug: "politiek" },
  { id: "voetbal", label: "Voetbal", slug: "voetbal" },
  { id: "f1", label: "Formule 1", slug: "formule-1" },
  { id: "auto", label: "Auto", slug: "auto" },
  { id: "tech", label: "Tech & AI", slug: "tech" },
  { id: "haarlem", label: "Haarlem", slug: "haarlem" },
  { id: "showbizz", label: "Showbizz", slug: "showbizz" },
];
export const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.id, c.label])) as Record<Cat, string>;

export type TabOpt = { value: View; id: string; label: string; short: string };

/** Tabbalk: nieuws-tabs zonder items verdwijnen, behalve de actieve (deeplink); Home, Filmpjes en Dumpert blijven altijd. */
export function tabOpties(items: { cat: Cat }[], view: View): TabOpt[] {
  const gevuld = new Set(items.map((i) => i.cat));
  return [
    { value: "alles", id: "all", label: "Home", short: "Home" },
    ...CATS.filter((c) => gevuld.has(c.id) || c.id === view).map((c) => ({
      value: c.id as View, id: c.id, label: c.label, short: c.id === "nl" ? "NL" : c.id === "tech" ? "Tech" : c.label,
    })),
    { value: "filmpjes", id: "filmpjes", label: "Filmpjes", short: "Filmpjes" },
    { value: "dumpert", id: "dumpert", label: "Dumpert", short: "Dumpert" },
  ];
}
