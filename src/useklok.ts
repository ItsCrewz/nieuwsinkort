import { useEffect, useState } from "react";

// Ook zonder nieuwe serverdata kunnen tijdvensters verlopen.
export function useKlok() {
  const [, ververs] = useState(0);
  useEffect(() => {
    const tik = () => ververs((n) => n + 1);
    const zichtbaar = () => { if (!document.hidden) tik(); };
    const timer = window.setInterval(() => { if (!document.hidden) tik(); }, 1000);
    document.addEventListener("visibilitychange", zichtbaar);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", zichtbaar);
    };
  }, []);
}
