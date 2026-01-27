import React from "react";
import { createPortal } from "react-dom";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default function Tooltip({ content, children, disabled, maxWidth = 420, offset = 12 }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const id = React.useId();

  const text = typeof content === "string" ? content : content === null || content === undefined ? "" : String(content);
  const isDisabled = disabled || !text;

  const onMove = (e) => {
    setPos({ x: e.clientX, y: e.clientY });
  };

  const onEnter = (e) => {
    if (isDisabled) return;
    setOpen(true);
    setPos({ x: e.clientX, y: e.clientY });
  };

  const onLeave = () => setOpen(false);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const flipX = pos.x > vw * 0.66;
  const flipY = pos.y > vh * 0.72;
  const left = clamp(pos.x + offset, 8, Math.max(8, vw - 8));
  const top = clamp(pos.y + offset, 8, Math.max(8, vh - 8));

  return (
    <>
      <span
        style={{ display: "inline-flex", minWidth: 0 }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onMouseMove={onMove}
        onFocus={(e) => onEnter(e)}
        onBlur={onLeave}
        aria-describedby={open && !isDisabled ? id : undefined}
      >
        {children}
      </span>
      {open && !isDisabled && typeof document !== "undefined"
        ? createPortal(
            <div className="tooltip-layer" style={{ left, top }}>
              <div
                className={`tooltip-bubble ${flipX ? "flip-x" : ""} ${flipY ? "flip-y" : ""}`}
                id={id}
                role="tooltip"
                style={{ maxWidth }}
              >
                {text}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

