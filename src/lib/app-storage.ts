export const STORAGE_KEYS = {
  constitution: "guan-she:constitution-result",
  tongueCapture: "guan-she:tongue-capture",
  tongueObservation: "guan-she:tongue-observation",
  tongueModelAnalysis: "guan-she:tongue-model-analysis",
} as const;

export function loadJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown, storage: "local" | "session" = "local") {
  if (typeof window === "undefined") return;

  const target = storage === "local" ? window.localStorage : window.sessionStorage;
  target.setItem(key, JSON.stringify(value));
}

export function removeStored(key: string) {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
}
