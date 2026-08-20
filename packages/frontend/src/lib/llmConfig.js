const STORAGE_KEY = "mccc_explorer_llm_config_v1";
const LEGACY_DEFAULT_MODEL = "deepseek-ai/DeepSeek-R1-Distill-Llama-8B";

export const DEFAULT_LLM_CONFIG = {
  model: "deepseek-ai/DeepSeek-R1-Distill-Llama-32B",
  apiKey: "local-no-auth",
};

export function loadLlmConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LLM_CONFIG };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_LLM_CONFIG };
    const rawModel = typeof parsed.model === "string" ? parsed.model.trim() : "";
    const model = rawModel ? (rawModel === LEGACY_DEFAULT_MODEL ? DEFAULT_LLM_CONFIG.model : rawModel) : DEFAULT_LLM_CONFIG.model;
    const apiKey = typeof parsed.apiKey === "string" && parsed.apiKey.trim() ? parsed.apiKey.trim() : DEFAULT_LLM_CONFIG.apiKey;
    return { model, apiKey };
  } catch {
    return { ...DEFAULT_LLM_CONFIG };
  }
}

export function saveLlmConfig(next) {
  if (!next || typeof next !== "object") return;
  const safe = {
    model: typeof next.model === "string" ? next.model.trim() : DEFAULT_LLM_CONFIG.model,
    apiKey: typeof next.apiKey === "string" ? next.apiKey.trim() : DEFAULT_LLM_CONFIG.apiKey,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
}

export function resetLlmConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
