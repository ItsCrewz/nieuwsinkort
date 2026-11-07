export function rooktest(
  basis?: string,
  ophalen?: (url: URL, opties: { redirect: "manual"; signal: AbortSignal }) => Promise<Response>,
  timeout?: number,
): Promise<void>;
