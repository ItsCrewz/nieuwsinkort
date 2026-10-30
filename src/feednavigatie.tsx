import type { ReactNode } from "react";

export function FeedNavigatie({ verborgen, children }: { verborgen: boolean; children: ReactNode }) {
  return <div className="nf-ui" aria-hidden={verborgen} {...(verborgen ? { inert: "" } : {})}>{children}</div>;
}
