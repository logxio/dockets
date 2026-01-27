import React from "react";
import { useI18n } from "../lib/i18n";

export default function SmartLoader({
  messages,
  intervalMs = 1100,
  className = "",
}) {
  const { t } = useI18n();
  const list =
    Array.isArray(messages) && messages.length
      ? messages
      : [t("loader.analyzing"), t("loader.checking"), t("loader.synthesizing")].filter(Boolean);
  const safeList = list.length ? list : [t("loader.loading")];
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    setIdx(0);
    const tmr = setInterval(() => setIdx((i) => (i + 1) % safeList.length), Math.max(500, Number(intervalMs) || 1100));
    return () => clearInterval(tmr);
  }, [intervalMs, safeList.length]);

  return (
    <div className={`smart-loader ${className}`.trim()}>
      <span className="spinner" aria-hidden="true" />
      <span className="smart-loader-text">{safeList[idx] || t("loader.loading")}</span>
    </div>
  );
}
