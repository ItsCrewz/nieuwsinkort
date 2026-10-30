export function samenvattingBasis(basis: string | undefined, bron: string, min: number): string {
  if (basis === "beschrijving") return "op basis van beschrijving";
  return bron === "spraak" ? `Uit wat er gezegd wordt${min ? ` (eerste ${min} min)` : ""}` : "Uit de ondertiteling";
}
