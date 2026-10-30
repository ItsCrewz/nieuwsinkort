// Vroege data.json-fetch: index.html start hem al tijdens het parsen (parallel aan het JS-bundel);
// de eerste load() in useData neemt die promise over. Daarna altijd een verse fetch.
export function neemVroegeData(w: { __vroegData?: Promise<Response> } = window as any): Promise<Response> | null {
  const p = w.__vroegData;
  delete w.__vroegData; // eenmalig: latere verversingen halen zelf op
  return p ?? null;
}
