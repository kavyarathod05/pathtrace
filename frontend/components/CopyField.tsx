"use client";

import { useState } from "react";

function CopyIcon({ done }: { done: boolean }) {
  return done ? (
    <svg className="ic" width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M13 4L6 11.5L3 8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg className="ic" width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 11V4a1 1 0 011-1h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button className={`copy-btn${done ? " done" : ""}`} onClick={copy} type="button">
      <CopyIcon done={done} />
      {done ? "Copied" : label}
    </button>
  );
}

export function CopyField({ label, value }: { label?: string; value: string }) {
  return (
    <div className="copy-field">
      <div style={{ minWidth: 0 }}>
        {label && <div className="cf-key">{label}</div>}
        <div className="cf-val">{value}</div>
      </div>
      <CopyButton value={value} />
    </div>
  );
}
