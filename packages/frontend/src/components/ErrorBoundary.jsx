/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { t } from "../lib/i18n";

function ErrorFallback({ title, error, onReset }) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return (
    <div className="warning" style={{ display: "grid", gap: 10, padding: 12 }}>
      <div style={{ fontWeight: 900 }}>{title || t("errorBoundary.defaultTitle")}</div>
      <div className="subtle" style={{ whiteSpace: "pre-wrap" }}>
        {message}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn small primary" type="button" onClick={onReset}>
          {t("errorBoundary.retry")}
        </button>
        <span className="pill">{t("errorBoundary.tip")}</span>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === "function") {
      try {
        this.props.onError(error, info);
      } catch {
        // ignore
      }
    }
  }

  componentDidUpdate(prevProps) {
    // Reset when key-like prop changes (e.g. view switch)
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  reset = () => {
    this.setState({ error: null });
    if (typeof this.props.onReset === "function") this.props.onReset();
  };

  render() {
    const { error } = this.state;
    if (error) {
      const Fallback = this.props.fallback ?? ErrorFallback;
      return <Fallback title={this.props.title} error={error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}
