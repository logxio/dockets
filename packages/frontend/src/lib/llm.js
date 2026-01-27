import { chatCompletions, extractAssistantText } from "./llmClient";
import { isMockMode } from "./llmEnv";

export function getLLMMode() {
  return isMockMode() ? "mock" : "live";
}

function mockResponse(prompt, context) {
  return {
    mode: "mock",
    message: "Demo Mode - LLM responses are simulated.",
    prompt: String(prompt ?? ""),
    claims: Array.isArray(context?.topInsights) ? context.topInsights.slice(0, 3) : [],
    verified: true,
  };
}

async function liveResponse(prompt, context, { apiKey, model, timeoutMs } = {}) {
  const resp = await chatCompletions({
    apiKey,
    timeoutMs,
    body: {
      model,
      messages: [{ role: "user", content: String(prompt ?? "") }],
      max_tokens: 800,
      temperature: 0.2,
    },
  });
  const text = extractAssistantText(resp);
  return {
    mode: resp?.mock ? "mock" : "live",
    message: resp?.mock ? "Demo Mode - LLM responses are simulated." : "Live Mode",
    prompt: String(prompt ?? ""),
    raw: text,
    meta: { mock: !!resp?.mock, reason: String(resp?.mockReason ?? "") },
    context,
  };
}

export async function queryLLM(prompt, context, opts) {
  if (getLLMMode() === "mock") return mockResponse(prompt, context);
  try {
    return await liveResponse(prompt, context, opts);
  } catch (e) {
    return {
      ...mockResponse(prompt, context),
      error: e instanceof Error ? e.message : String(e ?? "LLM_ERROR"),
    };
  }
}
