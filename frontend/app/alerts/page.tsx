"use client";

import { useEffect, useState } from "react";
import {
  createAlertRule,
  deleteAlertRule,
  fetchAlertEvents,
  fetchAlertRules,
  fetchServices,
} from "@/lib/api";
import { useProject } from "@/lib/project";
import type { AlertEvent, AlertRule } from "@/lib/types";
import { formatDuration, formatPercent, formatTimeAgo, serviceColor } from "@/lib/format";

const METRICS = [
  { value: "p95_latency_us", label: "p95 latency" },
  { value: "error_rate", label: "error rate" },
];

export default function AlertsPage() {
  const { project } = useProject();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [service, setService] = useState("");
  const [metric, setMetric] = useState("p95_latency_us");
  const [op, setOp] = useState(">");
  const [threshold, setThreshold] = useState("");

  const reload = () => {
    Promise.all([fetchAlertRules(project), fetchAlertEvents(project)])
      .then(([r, e]) => {
        setRules(r);
        setEvents(e);
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    reload();
    fetchServices(project).then(setServices).catch(() => {});
  }, [project]);

  const submit = async () => {
    setError(null);
    try {
      // Convert latency threshold from ms input to microseconds.
      let t = parseFloat(threshold);
      if (metric === "p95_latency_us") t = t * 1000;
      await createAlertRule(project, { name, service: service || undefined, metric, op, threshold: t, windowSec: 3600 });
      setName("");
      setThreshold("");
      reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const remove = async (id: number) => {
    await deleteAlertRule(project, id);
    reload();
  };

  const fmtThreshold = (r: AlertRule) =>
    r.metric === "error_rate" ? formatPercent(r.threshold) : formatDuration(r.threshold);
  const fmtValue = (e: AlertEvent) =>
    e.metric === "error_rate" ? formatPercent(e.value) : formatDuration(e.value);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alerts &amp; SLOs</h1>
          <div className="sub">Threshold rules evaluated on a schedule against service metrics</div>
        </div>
      </div>

      <div className="page-body">
        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="toolbar">
          <div className="field">
            <label>Rule name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Payments latency SLO" />
          </div>
          <div className="field">
            <label>Service</label>
            <select value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">All services</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Op</label>
            <select value={op} onChange={(e) => setOp(e.target.value)} style={{ minWidth: 70 }}>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
            </select>
          </div>
          <div className="field">
            <label>{metric === "error_rate" ? "Threshold (0–1)" : "Threshold (ms)"}</label>
            <input value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={metric === "error_rate" ? "0.05" : "250"} style={{ minWidth: 120 }} />
          </div>
          <div className="spacer" />
          <button className="btn" onClick={submit} disabled={!name || !threshold}>Add rule</button>
        </div>

        <div className="row-gap">
          <div className="grow">
            <div className="panel">
              <div className="panel-title"><span>Rules</span><span className="hint">{rules.length}</span></div>
              {rules.length === 0 ? (
                <div className="empty">No alert rules yet.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Target</th>
                      <th>Condition</th>
                      <th style={{ width: 60 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>
                          {r.service ? (
                            <span className="svc-tag"><span className="swatch" style={{ background: serviceColor(r.service) }} />{r.service}</span>
                          ) : <span className="hint">all</span>}
                        </td>
                        <td>
                          <code>{METRICS.find((m) => m.value === r.metric)?.label ?? r.metric} {r.op} {fmtThreshold(r)}</code>
                        </td>
                        <td><button className="btn danger" onClick={() => remove(r.id)}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div style={{ width: 420, flex: "none" }}>
            <div className="panel">
              <div className="panel-title"><span>Recent firings</span><span className="hint">{events.length}</span></div>
              {events.length === 0 ? (
                <div className="empty">No alerts have fired.<div style={{ marginTop: 8 }}><code>go run ./cmd/cron</code></div></div>
              ) : (
                <table>
                  <thead>
                    <tr><th>Rule</th><th className="num">Value</th><th className="num">When</th></tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.ruleName}
                          <div className="hint">{e.service || "all"}</div>
                        </td>
                        <td className="num"><span className="badge-err">{fmtValue(e)}</span></td>
                        <td className="num hint">{formatTimeAgo(e.firedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
