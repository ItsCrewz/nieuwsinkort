// Bij het YouTube-vangnet moet de speler zelf de tik kunnen ontvangen.
export const posterVerborgen = (kind: string | undefined, beeld: boolean, playable: boolean, mount: boolean, vangnet = false): boolean =>
  playable && mount && (beeld || (kind === "youtube" && vangnet));
