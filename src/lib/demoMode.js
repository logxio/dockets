export function isDemoMode(search = "") {
  try {
    if (String(import.meta.env?.VITE_DEMO_MODE ?? "").toLowerCase() === "true") return true;
  } catch {
    // ignore
  }
  try {
    const sp = new URLSearchParams(String(search || "").startsWith("?") ? String(search || "").slice(1) : String(search || ""));
    const v = sp.get("demo");
    return v === "1" || String(v).toLowerCase() === "true";
  } catch {
    return false;
  }
}

