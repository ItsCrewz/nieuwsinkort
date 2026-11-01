// Onderwerpgroepen van de Filmpjes-tab (#459): vaste volgorde, Sport altijd onderaan. Gedeeld door Worker (indeling) en frontend (weergave).
import type { Video } from "./types";

export const FILM_GROEPEN = ["Nieuws", "Politiek", "Showbizz", "Opvallend", "Sport"] as const;
export type FilmGroep = (typeof FILM_GROEPEN)[number];
export const isFilmGroep = (x: unknown): x is FilmGroep => typeof x === "string" && (FILM_GROEPEN as readonly string[]).includes(x);

/** Items zonder (of met een onbekende) groep, bijvoorbeeld in oude data.json, horen bij Nieuws. */
export const groepVan = (v: { groep?: unknown }): FilmGroep => (isFilmGroep(v.groep) ? v.groep : "Nieuws");

/** Niet-lege groepen in vaste volgorde; binnen een groep blijft de bestaande volgorde. */
export function groepeer<T extends { groep?: unknown }>(list: T[]): { groep: FilmGroep; list: T[] }[] {
  return FILM_GROEPEN.map((groep) => ({ groep, list: list.filter((v) => groepVan(v) === groep) })).filter((g) => g.list.length);
}

/** Dezelfde lijst, stabiel op groep gesorteerd: de volgorde van de weergave en van het doorlopend kijken. */
export const sorteerOpGroep = <T extends { groep?: unknown }>(list: T[]): T[] => groepeer(list).flatMap((g) => g.list);

/** Koppen alleen als de data groepen kent (oude data.json blijft ongewijzigd). */
export const heeftGroepen = (list: Pick<Video, "groep">[]) => list.some((v) => isFilmGroep(v.groep));
