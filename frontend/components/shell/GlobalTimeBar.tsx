"use client";

import { TIME_WINDOWS, useTimeWindow } from "@/lib/time-context";
import { useProject } from "@/lib/project";

export function GlobalTimeBar() {
  const { project } = useProject();
  const { window, setWindow, range, refresh, autoRefresh, setAutoRefresh, showTimeBar } =
    useTimeWindow();

  if (!showTimeBar) return null;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="global-time-bar">
      <div className="gtb-left">
        <span className="gtb-label">Time range</span>
        <div className="seg gtb-seg">
          {TIME_WINDOWS.map((w) => (
            <button
              key={w.value}
              type="button"
              className={window === w.value ? "on" : ""}
              onClick={() => setWindow(w.value)}
            >
              Last {w.label}
            </button>
          ))}
        </div>
      </div>
      <div className="gtb-center">
        <span className="gtb-range">
          {fmt(range.start)} → {fmt(range.end)}
        </span>
        <span className="gtb-project">
          project <code>{project}</code>
        </span>
      </div>
      <div className="gtb-right">
        <label className="gtb-auto check">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh
        </label>
        <button type="button" className="btn ghost sm" onClick={refresh}>
          Refresh
        </button>
      </div>
    </div>
  );
}
