import { ams } from "../src/tijd";

// Alleen de laatste minuten voor een grens zijn relevant; daar verandert de tijdzone-offset niet.
export function dagCache(t = Date.now()) {
  const a = ams(t);
  const seconden = a.h * 3600 + a.min * 60 + a.s;
  const grens = a.h < 6 ? 6 * 3600 : 24 * 3600;
  const duur = Math.max(0, Math.min(300, Math.floor(grens - seconden - (t % 1000) / 1000)));
  return { periode: `${a.iso}-${a.h < 6 ? "nacht" : "dag"}`, header: `public, max-age=${duur}, must-revalidate` };
}

export function begrensCache(response: Response): Response {
  const headers = new Headers(response.headers);
  const oud = Number(/max-age=(\d+)/.exec(headers.get("Cache-Control") || "")?.[1] || 0);
  const nieuw = Number(/max-age=(\d+)/.exec(dagCache().header)![1]);
  headers.set("Cache-Control", `public, max-age=${Math.min(oud, nieuw)}, must-revalidate`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function geldigeDag(dag: string, t = Date.now()): boolean {
  const nu = ams(t);
  const gisteren = new Date(Date.UTC(nu.y, nu.m - 1, nu.d - 1)).toISOString().slice(0, 10);
  return dag === nu.iso || (nu.h < 6 && dag === gisteren);
}
