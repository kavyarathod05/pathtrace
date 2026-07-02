"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchConnect } from "@/lib/api";
import type { ConnectInfo } from "@/lib/types";
import { API_BASE } from "@/lib/api";
import { DEFAULT_PROJECT } from "@/lib/project";
import { CopyField } from "@/components/CopyField";

export default function ConnectPage() {
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConnect().then(setInfo).catch((e) => setError(String(e)));
  }, []);

  const endpoint = info?.httpEndpoint ?? `${API_BASE}/v1/traces`;
  const grpcHost = info?.grpcEndpoint?.replace(/^https?:\/\//, "") ?? "localhost";
  const grpcPort = info?.grpcPort ?? "4317";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Connect Your App</h1>
          <div className="sub">Send OpenTelemetry traces with one endpoint and an optional API key</div>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-title">Three steps to start tracing</div>
          <div className="field-block">
            {[
              { n: 1, title: "Install the OpenTelemetry SDK", body: "Add the SDK for your language (Go, Node, Python, Java, etc.) and enable auto-instrumentation for HTTP/gRPC." },
              { n: 2, title: "Point export at PathTrace", body: "Set the OTLP endpoint below. For Go services, use gRPC on the port shown. For curl or JSON clients, use the HTTP endpoint." },
              { n: 3, title: "View traces in the UI", body: `Open Explore and select project "${DEFAULT_PROJECT}" (public demo) or your own project via the sidebar selector.` },
            ].map((s) => (
              <div key={s.n} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span className="step-num">{s.n}</span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
                  <div className="hint" style={{ lineHeight: 1.55 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="section-label">Ingest endpoints</div>
        <div className="conn-grid" style={{ marginBottom: 18 }}>
          <div className="panel">
            <div className="panel-title">HTTP · OTLP JSON</div>
            <div className="field-block">
              <CopyField label="POST endpoint" value={endpoint} />
              <CopyField label="Content-Type" value="application/json" />
              <CopyField label="Project header" value="x-pathtrace-key: YOUR_KEY" />
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">gRPC · OTLP protobuf</div>
            <div className="field-block">
              <CopyField label="Host" value={grpcHost} />
              <CopyField label="Port" value={grpcPort} />
              <CopyField label="Metadata header" value="x-pathtrace-key" />
            </div>
          </div>
        </div>

        <div className="section-label">SDK environment variables</div>
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="field-block">
            <CopyField label="OTEL_EXPORTER_OTLP_ENDPOINT" value={info?.otelEnvExample?.OTEL_EXPORTER_OTLP_ENDPOINT ?? API_BASE} />
            <CopyField label="OTEL_EXPORTER_OTLP_PROTOCOL" value="grpc (Go SDK) · http/json (curl)" />
            <CopyField label="OTEL_SERVICE_NAME" value="my-service" />
            <CopyField label="Optional project key" value={`x-pathtrace-key=YOUR_KEY`} />
          </div>
        </div>

        <div className="section-label">View traces</div>
        <div className="panel">
          <div className="field-block">
            <CopyField label="Demo project (no key to view)" value={DEFAULT_PROJECT} />
            <CopyField label="Explore URL" value={`/explore?project=${DEFAULT_PROJECT}`} />
            <p className="hint" style={{ margin: 0 }}>
              Use the project selector in the sidebar to switch tenants. Senders need an API key; viewers of the demo project do not.
            </p>
            <Link href="/explore" className="btn" style={{ alignSelf: "flex-start", marginTop: 4 }}>Open Explore</Link>
          </div>
        </div>
      </div>
    </>
  );
}
