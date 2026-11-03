import { ams, midnight } from "../../src/tijd";

/** Bewaar de definitieve lijst alleen bij wijziging; gebruik gisteren uitsluitend vroeg op de dag. */
export function videomoment<T extends object>(lijst: T[], vorig: { dag: string; lijst: T[] } | undefined, now: number, toegestaan: (v: T) => boolean) {
  const dag = ams(now);
  if (lijst.length) {
    const moment = { dag: dag.iso, lijst };
    return { lijst, bewaar: JSON.stringify(vorig) === JSON.stringify(moment) ? undefined : moment };
  }
  const terugval = dag.h < 10 && vorig?.dag === ams(midnight(now) - 1).iso && Array.isArray(vorig.lijst)
    ? vorig.lijst.filter(toegestaan).map((v) => ({ ...v, gisteren: true })) : lijst;
  return { lijst: terugval, bewaar: undefined };
}
