function normalizeTheme(theme) {
  const v = String(theme ?? "")
    .trim()
    .toLowerCase();
  if (v === "dark" || v === "night") return "dark";
  if (v === "light" || v === "day") return "light";
  return "";
}

export function detectTheme({ search = "", storageKey = "cldemo_theme" } = {}) {
  // First check current document (may be set by inline script before React)
  try {
    const current = normalizeTheme(document?.documentElement?.dataset?.theme);
    if (current) return current;
  } catch {
    // ignore
  }
  try {
    const sp = new URLSearchParams(String(search || "").startsWith("?") ? String(search || "").slice(1) : String(search || ""));
    const q = normalizeTheme(sp.get("theme"));
    if (q) return q;
  } catch {
    // ignore
  }
  try {
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      const inherited = normalizeTheme(window.parent?.document?.documentElement?.dataset?.theme);
      if (inherited) return inherited;
    }
  } catch {
    // ignore
  }
  try {
    const saved = normalizeTheme(window.localStorage.getItem(storageKey));
    if (saved) return saved;
  } catch {
    // ignore
  }
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    }
  } catch {
    // ignore
  }
  return "light";
}

export function applyTheme(theme) {
  const t = normalizeTheme(theme) || "light";
  try {
    document.documentElement.dataset.theme = t;
  } catch {
    // ignore
  }
  return t;
}
