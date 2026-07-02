"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { liveTailURL } from "@/lib/api";
import { useProject } from "@/lib/project";
import type { Span } from "@/lib/types";
import { formatClock, formatDuration, serviceColor } from "@/lib/format";

const MAX_ROWS = 200;

export default function LiveTailPage() {
  const { project } = useProject();
  const [spans, setSpans] = useState<Span[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const es = new EventSource(liveTailURL(project));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      if (pausedRef.current) return;
      try {
        const span = JSON.parse(ev.data) as Span;
        setSpans((prev) => [span, ...prev].slice(0, MAX_ROWS));
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [project]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Live Tail</h1>
          <div className="sub">Spans appear in real time as they are ingested · project <code>{project}</code></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={`live-pill${connected ? "" : " off"}`}>
            <span className="beat" />
            {connected ? "streaming" : "disconnected"}
          </span>
          <button className="btn ghost" onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</button>
          <button className="btn ghost" onClick={() => setSpans([])}>Clear</button>
        </div>
      </div>

      <div className="page-body">
        <div className="panel">
          <div className="tail-row tail-head">
            <span>Time</span><span>Service</span><span>Operation</span>
            <span style={{ textAlign: "right" }}>Duration</span>
            <span style={{ textAlign: "right" }}>Status</span>
          </div>
          {spans.length === 0 ? (
            <div className="empty">
              <div className="big">Waiting for spans…</div>
              Send traffic from a connected app or the demo microservices to see live telemetry here.
            </div>
          ) : (
            spans.map((s, i) => (
              <Link key={`${s.spanId}-${i}`} href={`/traces/${s.traceId}`} className={`tail-row${i === 0 ? " tail-new" : ""}`}>
                <span style={{ color: "var(--text-faint)" }}>{formatClock(s.startTime)}</span>
                <span className="svc-tag">
                  <span className="swatch" style={{ background: serviceColor(s.serviceName) }} />
                  {s.serviceName}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.operationName}</span>
                <span style={{ textAlign: "right" }}>{formatDuration(s.durationUs)}</span>
                <span style={{ textAlign: "right" }}>
                  {s.statusCode === "ERROR" ? <span className="badge-err">ERR</span> : <span className="badge-ok">ok</span>}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
