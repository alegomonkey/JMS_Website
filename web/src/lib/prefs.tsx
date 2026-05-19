import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface PrefsContextValue {
  onScreenKeyboard: boolean;
  setOnScreenKeyboard: (next: boolean) => void;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);
const STORAGE_KEY = "jms.onScreenKeyboard";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function PrefsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [onScreenKeyboard, setOSK] = useState<boolean>(read);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, onScreenKeyboard ? "1" : "0");
  }, [onScreenKeyboard]);

  // Keep tabs in sync if the user flips the toggle on another open page.
  useEffect(() => {
    function handle(e: StorageEvent): void {
      if (e.key === STORAGE_KEY) setOSK(e.newValue === "1");
    }
    window.addEventListener("storage", handle);
    return () => window.removeEventListener("storage", handle);
  }, []);

  const setOnScreenKeyboard = useCallback((next: boolean) => setOSK(next), []);

  const value = useMemo(
    () => ({ onScreenKeyboard, setOnScreenKeyboard }),
    [onScreenKeyboard, setOnScreenKeyboard],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside PrefsProvider");
  return ctx;
}
