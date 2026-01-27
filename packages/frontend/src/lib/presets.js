const MAHARI_MAPPING = Object.freeze({
  sender: "PlaintiffFirm",
  receiver: "DefendantFirm",
  metabolite: "CaseType",
  sensor: "Court",
  annotation: "Outcome",
  score: "Weight",
});

export const presets = Object.freeze({
  top100: Object.freeze({
    name: "Top 100 Firms",
    file: "/sample/mahari_top100_interactions.csv",
    mapping: MAHARI_MAPPING,
  }),
  top50: Object.freeze({
    name: "Top 50 Firms",
    file: "/sample/mahari_top50_interactions.csv",
    mapping: MAHARI_MAPPING,
  }),
  fig2: Object.freeze({
    name: "Mahari Fig2 (full)",
    file: "/sample/mahari_fig2_moesm4_interactions.csv",
    mapping: MAHARI_MAPPING,
  }),
});

export function getPreset(key) {
  const k = String(key ?? "").trim();
  return presets[k] || presets.top100;
}
