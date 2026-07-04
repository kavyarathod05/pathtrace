"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { liveTailURL } from "@/lib/api";
import { startClientDemoLiveFeed } from "@/lib/live-demo";
import { DEFAULT_PROJECT, useProject } from "@/lib/project";
import type { Span } from "@/lib/types";
import { formatClock, formatDuration, serviceColor } from "@/lib/format";

const MAX_ROWS = 200;
const DEMO_FALLBACK_MS = 2500;

export default function LiveTailPage() {
  const { project } = useProject();
  const [spans, setSpans] = useState<Span[]>([]);
  const [connected, setConnected] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  const gotLiveRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    gotLiveRef.current = false;
    setSpans([]);
    setDemoMode(false);

    let stopClientDemo: (() => void) | null = null;
    const stopDemo = () => {
      stopClientDemo?.();
      stopClientDemo = null;
    };

    const onLiveSpan = (span: Span) => {
      gotLiveRef.current = true;
      setDemoMode(false);
      stopDemo();
      if (pausedRef.current) return;
      setSpans((prev) => [span, ...prev].slice(0, MAX_ROWS));
    };

    const es = new EventSource(liveTailURL(project));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      try {
        onLiveSpan(JSON.parse(ev.data) as Span);
      } catch {
        /* ignore */
      }
    };

    const fallbackTimer = setTimeout(() => {
      if (gotLiveRef.current || project !== DEFAULT_PROJECT) return;
      setDemoMode(true);
      setConnected(true);
      stopClientDemo = startClientDemoLiveFeed(project, (span) => {
        if (pausedRef.current) return;
        setSpans((prev) => [span, ...prev].slice(0, MAX_ROWS));
      });
    }, DEMO_FALLBACK_MS);

    return () => {
      es.close();
      clearTimeout(fallbackTimer);
      stopDemo();
      setConnected(false);
    };
  }, [project]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Live Tail</h1>
          <div className="sub">
            Spans appear in real time as they are ingested · project <code>{project}</code>
            {demoMode && (
              <span className="demo-badge" style={{ marginLeft: 10 }}>
                demo stream
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={`live-pill${connected ? "" : " off"}`}>
            <span className="beat" />
            {connected ? (demoMode ? "demo replay" : "streaming") : "disconnected"}
          </span>
          <button className="btn ghost" onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</button>
          <button className="btn ghost" onClick={() => setSpans([])}>Clear</button>
        </div>
      </div>

      <div className="page-body">
        {demoMode && (
          <div className="note-banner" style={{ marginBottom: 12 }}>
            Simulating checkout traffic for the demo project — spans replay realistic e-commerce call patterns.
            Connect your app via <Link href="/connect" className="link">Connect</Link> to see real OTLP ingest.
          </div>
        )}
        <div className="panel">
          <div className="tail-row tail-head">
            <span>Time</span><span>Service</span><span>Operation</span>
            <span style={{ textAlign: "right" }}>Duration</span>
            <span style={{ textAlign: "right" }}>Status</span>
          </div>
          {spans.length === 0 ? (
            <div className="empty">
              <div className="big">{connected ? "Waiting for spans…" : "Connecting…"}</div>
              {project === DEFAULT_PROJECT
                ? "Demo traffic will appear automatically in a few seconds."
                : "Send traffic from a connected app to see live telemetry here."}
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
