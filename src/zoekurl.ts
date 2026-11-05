export function leesZoekterm(search: string): string {
  return new URLSearchParams(search).get("q") ?? "";
}

export function schrijfZoekterm(url: string, term: string): string {
  const adres = new URL(url);
  if (term) adres.searchParams.set("q", term);
  else adres.searchParams.delete("q");
  return `${adres.pathname}${adres.search}${adres.hash}`;
}
