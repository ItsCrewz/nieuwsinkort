// Eén plek voor gewone uitgaande GET's van de Worker: UA, time-out en Accept per aanroep. De URL-controle blijft in `externeFetch` (url.ts).
export type HaalOpties = { ua?: string; timeout: number; accept?: string; taal?: string; redirect?: RequestRedirect };
export const haal = (url: string, o: HaalOpties): Promise<Response> => {
  const headers: Record<string, string> = {};
  if (o.ua) headers["User-Agent"] = o.ua;
  if (o.accept) headers.Accept = o.accept;
  if (o.taal) headers["Accept-Language"] = o.taal;
  return fetch(url, { headers, signal: AbortSignal.timeout(o.timeout), ...(o.redirect ? { redirect: o.redirect } : {}) });
};
