// Wanneer de poster weggaat. YouTube meldt op iOS geen playerState, dus de poster mag die iframe nooit afdekken (#255).
export const posterVerborgen = (kind: string | undefined, beeld: boolean, playable: boolean, mount: boolean): boolean =>
  playable && mount && (kind === "youtube" || beeld);
