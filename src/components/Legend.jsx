import React from "react";
import Tooltip from "./Tooltip";
import { useI18n } from "../lib/i18n";

function Chip({ color, label }) {
  return (
    <div className="row" style={{ gap: 8, fontSize: 12, color: "var(--muted)" }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: color,
          boxShadow: "0 0 0 3px rgba(2,132,199,0.10)",
        }}
      />
      <span>{label}</span>
    </div>
  );
}

function GradientBar({ label }) {
  const { lang } = useI18n();
  const tx = (zh, en) => (lang === "en" ? en : zh);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 650 }}>{label}</div>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: "linear-gradient(90deg, rgba(226,232,240,1), rgba(2,132,199,1))",
          border: "1px solid rgba(15,23,42,0.10)",
        }}
      />
      <div className="row split" style={{ fontSize: 11, color: "var(--muted)" }}>
        <span>{tx("低", "low")}</span>
        <span>{tx("高", "high")}</span>
      </div>
    </div>
  );
}

function SizeLegend({ label, sizes }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 650 }}>{label}</div>
      <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
        {sizes.map((s) => (
          <div key={s} style={{ display: "grid", gap: 4, justifyItems: "center" }}>
            <div
              style={{
                width: s,
                height: s,
                borderRadius: 999,
                background: "rgba(2,132,199,0.85)",
                boxShadow: "0 0 0 4px rgba(2,132,199,0.12)",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Legend({ mode }) {
  const { lang } = useI18n();
  const tx = (zh, en) => (lang === "en" ? en : zh);
  return (
    <div className="row split" style={{ marginBottom: 10, flexWrap: "wrap", gap: 12 }}>
      <div className="pill">
        <span style={{ fontWeight: 700, color: "rgba(15,23,42,0.78)" }}>{tx("图例", "Legend")}</span>
        <span style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span>{tx("权重 = 导入的权重列", "weight = imported weight column")}</span>
          <Tooltip
            content={
              tx(
                "权重：来自导入数据的权重列（缺失则=1）。用于网络的边宽/颜色、矩阵的热力、以及摘要排序。",
                "Weight: from the imported weight column (defaults to 1 if missing). Used for network edge width/color, matrix heat, and summary ranking.",
              )
            }
          >
            <span
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: 18,
                height: 18,
                borderRadius: 999,
                border: "1px solid rgba(15,23,42,0.18)",
                color: "rgba(15,23,42,0.72)",
                fontSize: 12,
                fontWeight: 800,
                background: "rgba(255,255,255,0.7)",
              }}
              aria-label="Weight info"
            >
              i
            </span>
          </Tooltip>
        </span>
      </div>

      {mode === "network" ? (
        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <GradientBar label={tx("边颜色/宽度", "Edge color/width")} />
          <Chip color="rgba(2,132,199,0.85)" label={tx("节点大小：总权重", "Node size: total weight")} />
        </div>
      ) : mode === "matrix" ? (
        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <GradientBar label={tx("格子颜色", "Cell color")} />
          <Chip color="rgba(2,132,199,0.85)" label={tx("数值：聚合权重", "Value: aggregated weight")} />
        </div>
      ) : (
        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <GradientBar label={tx("点颜色：聚合权重", "Dot color: aggregated weight")} />
          <SizeLegend label={tx("点大小：计数", "Dot size: count")} sizes={[6, 12, 18]} />
        </div>
      )}
    </div>
  );
}
