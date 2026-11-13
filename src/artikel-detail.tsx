import { lazy, useState } from "react";

let detailModule: typeof import("./detail") | undefined;
let detailBelofte: Promise<typeof import("./detail")> | undefined;
export const laadDetail = () => detailBelofte ??= import("./detail").then((m) => (detailModule = m), (e) => { detailBelofte = undefined; throw e; });
const DetailView = lazy(() => laadDetail().then((m) => ({ default: m.DetailView })));
// Houd het componenttype gelijk zolang een artikel openstaat, ook als de module intussen laadt.
export function ArtikelDetail(props: React.ComponentProps<typeof DetailView>) {
  const [Component] = useState(() => detailModule?.DetailView ?? DetailView);
  return <Component {...props} />;
}
