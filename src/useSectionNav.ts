import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Home <-> section navigation shared by the Student and Teacher portals.
 * - go("home") always returns to the main dashboard (clouds / tesseract).
 * - The phone/browser Back button also returns Home instead of leaving the app.
 */
export function useSectionNav<T extends string>(home: T): [T, (v: T) => void] {
  const [view, setView] = useState<T>(home);
  const cur = useRef<T>(home);

  useEffect(() => {
    const onPop = (): void => {
      cur.current = home;
      setView(home);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [home]);

  const go = useCallback((v: T): void => {
    window.scrollTo({ top: 0 });
    if (v === home) {
      if (cur.current !== home && (window.history.state as { portalSection?: boolean } | null)?.portalSection) {
        window.history.back(); // popstate handler flips the view back to Home
      } else {
        cur.current = home;
        setView(home);
      }
      return;
    }
    if (cur.current === home) window.history.pushState({ portalSection: true }, "");
    cur.current = v;
    setView(v);
  }, [home]);

  return [view, go];
}
