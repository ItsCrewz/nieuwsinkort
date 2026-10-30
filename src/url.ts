// Defense in depth: alleen http(s)-links in href (React 18 laat javascript: door)
export const veiligeUrl = (u?: string) => (u && /^https?:\/\//i.test(u.trim()) ? u : undefined);
