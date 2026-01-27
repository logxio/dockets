import React from "react";

export default function ThemeToggle({ theme, setTheme }) {
  const current = String(theme) === "light" ? "light" : "dark";
  return (
    <div className="toggle-group" role="group" aria-label="theme">
      <button
        type="button"
        className={current === "dark" ? "active" : ""}
        onClick={() => (typeof setTheme === "function" ? setTheme("dark") : null)}
        title="Theme: dark"
      >
        ☾
      </button>
      <button
        type="button"
        className={current === "light" ? "active" : ""}
        onClick={() => (typeof setTheme === "function" ? setTheme("light") : null)}
        title="Theme: light"
      >
        ☀
      </button>
    </div>
  );
}
