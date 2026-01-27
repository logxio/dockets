import React from "react";

export default function LangToggle({ lang, setLang }) {
  const current = String(lang) === "en" ? "en" : "zh";
  return (
    <div className="toggle-group" role="group" aria-label="language">
      <button
        type="button"
        className={current === "en" ? "active" : ""}
        onClick={() => (typeof setLang === "function" ? setLang("en") : null)}
        title="Language: English"
      >
        EN
      </button>
      <button
        type="button"
        className={current === "zh" ? "active" : ""}
        onClick={() => (typeof setLang === "function" ? setLang("zh") : null)}
        title="语言：中文"
      >
        中
      </button>
    </div>
  );
}
