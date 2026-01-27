export function getLlmApiUrl() {
  if (isForceMock()) return "";
  if (isVercelHostname()) return "";

  const raw =
    (import.meta.env?.VITE_LLM_API_URL ??
      import.meta.env?.VITE_LLM_ENDPOINT ??
      import.meta.env?.VITE_LLM_API_BASE ??
      "") + "";
  const v = raw.trim();
  if (!v) return "";
  if (v === "mock" || v === "off" || v === "disabled") return "";
  return v;
}

export function isMockMode() {
  return !getLlmApiUrl();
}

export function getLlmMockReason() {
  if (isForceMock()) return "FORCED_MOCK";
  if (isVercelHostname()) return "VERCEL_DEPLOYMENT";
  const raw =
    (import.meta.env?.VITE_LLM_API_URL ??
      import.meta.env?.VITE_LLM_ENDPOINT ??
      import.meta.env?.VITE_LLM_API_BASE ??
      "") + "";
  return raw.trim() ? "UNKNOWN" : "ENV_MISSING";
}

function isForceMock() {
  const v = String(import.meta.env?.VITE_LLM_FORCE_MOCK ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isVercelHostname() {
  try {
    if (typeof window === "undefined") return false;
    const h = String(window.location?.hostname ?? "");
    return h.includes("vercel.app");
  } catch {
    return false;
  }
}
