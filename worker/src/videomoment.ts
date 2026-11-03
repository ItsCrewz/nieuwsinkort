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

/** Verwijder tijdelijke terugval voordat de vergelijkingsbody wordt berekend. */
export function zonderGisteren<T extends Record<string, any>>(data: T): T {
  return { ...data, filmpjes: (data.filmpjes || []).filter((v: any) => !v.gisteren), dumpert: (data.dumpert || []).filter((v: any) => !v.gisteren) };
}

export function videoToegestaan(id: string | null | undefined, geblokkeerd: Set<string>, cache: Record<string, { geblokkeerd: boolean | null }>): boolean {
  return !id || (!geblokkeerd.has(id) && cache?.[id]?.geblokkeerd !== true);
}
