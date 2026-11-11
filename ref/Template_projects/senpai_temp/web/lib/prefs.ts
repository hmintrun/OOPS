"use client";

import { useCallback, useEffect, useState } from "react";

// Per-device settings. Storage can be missing or throw, so defaults always work.
export type Rate = "slow" | "mid" | "fast";
export type Prefs = { voice: string; rate: Rate; subs: boolean };

export const RATES: Record<Rate, { name: string; value: number }> = {
  slow: { name: "Chậm", value: 0.85 },
  mid: { name: "Vừa", value: 1 },
  fast: { name: "Nhanh", value: 1.15 },
};

const KEY = "senpai.prefs";
const DEFAULTS: Prefs = { voice: "", rate: "mid", subs: false };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  useEffect(() => setPrefs(loadPrefs()), []);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // keep it for this page only
      }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}
