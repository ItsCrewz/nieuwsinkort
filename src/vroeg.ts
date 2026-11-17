// Vroege data.json-fetch: index.html start hem al tijdens het parsen (parallel aan het JS-bundel);
// de eerste load() in useData neemt die promise over. Daarna altijd een verse fetch.
export function neemVroegeData(w: { __vroegData?: Promise<Response> } = window as any): Promise<Response> | null {
  const p = w.__vroegData;
  delete w.__vroegData; // eenmalig: latere verversingen halen zelf op
  return p ?? null;
}

// Elke poging krijgt één tijdslimiet voor zowel de respons als de body.
const LAADTIJD_MS = 8000;

async function leesData(respons: Promise<Response>, tijd: number): Promise<any> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      (async () => {
        const r = await respons;
        if (!r.ok) throw new Error(String(r.status));
        const data = await r.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Ongeldige data");
        return data;
      })(),
      new Promise<never>((_, afwijs) => { timer = setTimeout(() => afwijs(new Error("Laadtijd verstreken")), tijd); }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

// Een mislukte vroege aanvraag krijgt eerst één nieuwe kans op actuele data.
export async function laadData(vroeg: Promise<Response> | null, ophalen: typeof fetch = fetch, tijd = LAADTIJD_MS): Promise<any> {
  try {
    return await leesData(vroeg ?? ophalen("/data.json", { cache: "no-cache" }), tijd);
  } catch {
    if (vroeg) return laadData(null, ophalen, tijd);
    return leesData(ophalen("/data.json?statisch=1", { cache: "no-cache" }), tijd);
  }
}
