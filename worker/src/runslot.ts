// Run-slot en tijdsgebaseerd AI-aandeel per run (#451): pure logica, zodat de Runner ook bij een cron van elke 5 minuten klopt.
import { ams } from "../../src/tijd";

export const SLOT_VERLOOP_MS = 10 * 60e3;
interface Opslag { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<unknown>; delete(key: string): Promise<unknown> }

/** Reserveer het slot; false = er loopt al een run (slot jonger dan 10 minuten). Een ouder slot is een crash en wordt overgenomen. */
export async function neemSlot(opslag: Opslag, nu: number): Promise<boolean> {
  const slot = await opslag.get<number>("runSlot");
  if (slot !== undefined && nu - slot < SLOT_VERLOOP_MS) return false;
  await opslag.put("runSlot", nu);
  return true;
}

/** Geef het slot vrij, maar alleen als het nog van deze run is (een overgenomen slot niet wissen). */
export async function geefSlot(opslag: Opslag, nu: number): Promise<void> {
  if (await opslag.get<number>("runSlot") === nu) await opslag.delete("runSlot");
}

/** Werkelijke tijd sinds de vorige start, afgerond op 5 minuten, 5..60; onbekend of ≤0 = 60. */
export function meetInterval(vorigeStart: number | undefined, nu: number): number {
  if (vorigeStart === undefined) return 60;
  const min = (nu - vorigeStart) / 60e3;
  if (!(min > 0)) return 60;
  return Math.min(60, Math.max(5, Math.round(min / 5) * 5));
}

/** Aantal runs dat nog volgt (inclusief deze) tot 24:00 Amsterdam; bij interval 60 gelijk aan 23 - uur + 1. */
export function runsOver(nu: number, interval: number): number {
  const a = ams(nu), dagMin = a.h * 60 + a.min;
  const slotStart = Math.floor(dagMin / interval) * interval;
  return Math.max(1, Math.max(interval, 1440 - slotStart) / interval);
}

/** Plafonds van een run uit het resterende budget; formules als vóór #451. De ondergrenzen (300, 120) schalen mee met het interval (bij 60 min ongewijzigd), anders verbruiken 12 runs per uur samen 12x de ondergrens. */
export function runPlafonds(restBudget: number, runsLeft: number, interval = 60) {
  const f = interval / 60;
  return { runBudget: Math.max(300 * f, (restBudget / runsLeft) * 2), diepRun: (diepRest: number) => Math.max(120 * f, Math.min(700, (diepRest / runsLeft) * 2)) };
}

/** Alarmteller per Amsterdams uur: alleen resetten bij een ander uur. */
export function voorafTeller(oud: { uur: number; n: number } | undefined, uur: number): { uur: number; n: number } {
  return oud && oud.uur === uur ? oud : { uur, n: 0 };
}
