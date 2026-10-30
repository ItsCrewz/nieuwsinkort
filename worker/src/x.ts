export const xUser = (u: string) => /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?!i\/|home|search)([A-Za-z0-9_]{1,15})\/?$/.exec(u)?.[1] || null;
