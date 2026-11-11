export function staatFocusInInvoer(element: { tagName: string; isContentEditable: boolean } | null): boolean {
  return !!element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable);
}
