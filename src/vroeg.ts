// Vroege data.json-fetch: index.html start hem al tijdens het parsen (parallel aan het JS-bundel);
// de eerste load() in useData neemt die promise over. Daarna altijd een verse fetch.
export function neemVroegeData(w: { __vroegData?: Promise<Response> } = window as any): Promise<Response> | null {
  const p = w.__vroegData;
  delete w.__vroegData; // eenmalig: latere verversingen halen zelf op
  return p ?? null;
}

// Na een mislukte vroege aanvraag eerst opnieuw actuele data proberen.
export async function laadData(vroeg: Promise<Response> | null, ophalen: typeof fetch = fetch): Promise<any> {
  async function lees(respons: Promise<Response>): Promise<any> {
    const r = await respons;
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Ongeldige data");
    return data;
  }
  if (vroeg) {
    try { return await lees(vroeg); } catch { /* probeer de actuele route opnieuw */ }
  }
  try {
    return await lees(ophalen("/data.json", { cache: "no-cache" }));
  } catch {
    return lees(ophalen("/data.json?statisch=1", { cache: "no-cache" }));
  }
}
