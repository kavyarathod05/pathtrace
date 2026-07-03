"use client";

import { useEffect, useState } from "react";
import {
  createAlertRule,
  createChannel,
  deleteAlertRule,
  deleteChannel,
  fetchAlertEvents,
  fetchAlertRules,
  fetchChannels,
  fetchServices,
  testChannel,
  updateAlertRule,
} from "@/lib/api";
import { useProject } from "@/lib/project";
import type { AlertEvent, AlertRule, NotificationChannel } from "@/lib/types";
import { formatDuration, formatPercent, formatTimeAgo, serviceColor } from "@/lib/format";

const METRICS = [
  { value: "p95_latency_us", label: "p95 latency" },
  { value: "error_rate", label: "error rate" },
  { value: "slo_burn_rate", label: "SLO burn rate" },
];

export default function AlertsPage() {
  const { project } = useProject();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [service, setService] = useState("");
  const [metric, setMetric] = useState("p95_latency_us");
  const [op, setOp] = useState(">");
  const [threshold, setThreshold] = useState("");
  const [channelId, setChannelId] = useState<number | "">("");

  const [chName, setChName] = useState("");
  const [chType, setChType] = useState("webhook");
  const [chUrl, setChUrl] = useState("");

  const reload = () => {
    Promise.all([fetchAlertRules(project), fetchAlertEvents(project), fetchChannels(project)])
      .then(([r, e, c]) => {
        setRules(r);
        setEvents(e);
        setChannels(c);
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    reload();
    fetchServices(project).then(setServices).catch(() => {});
    const id = setInterval(() => {
      fetchAlertEvents(project).then(setEvents).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [project]);

  const submit = async () => {
    setError(null);
    try {
      let t = parseFloat(threshold);
      if (metric === "p95_latency_us") t = t * 1000;
      await createAlertRule(project, {
        name,
        service: service || undefined,
        metric,
        op,
        threshold: t,
        windowSec: 3600,
        channelId: channelId === "" ? undefined : channelId,
      });
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

  const toggleRule = async (r: AlertRule) => {
    try {
      await updateAlertRule(project, r.id, { enabled: !r.enabled });
      setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));
    } catch (e) {
      setError(String(e));
    }
  };

  const addChannel = async () => {
    if (!chName || !chUrl) return;
    try {
      await createChannel(project, { name: chName, type: chType, config: { url: chUrl } });
      setChName("");
      setChUrl("");
      reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const removeChannel = async (id: number) => {
    await deleteChannel(project, id);
    reload();
  };

  const fmtThreshold = (r: AlertRule) => {
    if (r.metric === "error_rate" || r.metric === "slo_burn_rate") return formatPercent(r.threshold);
    return formatDuration(r.threshold);
  };
  const fmtValue = (e: AlertEvent) => {
    if (e.metric === "error_rate" || e.metric === "slo_burn_rate") return formatPercent(e.value);
    return formatDuration(e.value);
  };

  const stateBadge = (state: string) => {
    if (state === "firing") return <span className="badge-err">firing</span>;
    if (state === "resolved") return <span className="badge-ok">resolved</span>;
    return <span className="chip">{state}</span>;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alerts &amp; SLOs</h1>
          <div className="sub">Threshold rules evaluated on a schedule · events refresh every 30s</div>
        </div>
        <span className="live-pill"><span className="beat" /> auto-refresh 30s</span>
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
            <label>{metric === "error_rate" || metric === "slo_burn_rate" ? "Threshold (0–1)" : "Threshold (ms)"}</label>
            <input value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={metric === "error_rate" ? "0.05" : metric === "slo_burn_rate" ? "0.1" : "250"} style={{ minWidth: 120 }} />
          </div>
          <div className="field">
            <label>Channel</label>
            <select value={channelId === "" ? "" : String(channelId)} onChange={(e) => setChannelId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">None</option>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="spacer" />
          <button className="btn" onClick={submit} disabled={!name || !threshold}>Add rule</button>
        </div>

        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-title"><span>Notification channels</span><span className="hint">{channels.length}</span></div>
          <div className="toolbar" style={{ margin: 0, border: "none", borderRadius: 0, boxShadow: "none" }}>
            <div className="field">
              <label>Name</label>
              <input value={chName} onChange={(e) => setChName(e.target.value)} placeholder="Slack webhook" />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={chType} onChange={(e) => setChType(e.target.value)}>
                <option value="webhook">webhook</option>
                <option value="email">email</option>
              </select>
            </div>
            <div className="field grow">
              <label>URL / address</label>
              <input value={chUrl} onChange={(e) => setChUrl(e.target.value)} placeholder="https://hooks.example.com/…" style={{ width: "100%" }} />
            </div>
            <button className="btn ghost" onClick={addChannel} disabled={!chName || !chUrl}>Add channel</button>
          </div>
          {channels.length > 0 && (
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Config</th><th style={{ width: 140 }} /></tr></thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td><code>{c.type}</code></td>
                    <td className="hint mono" style={{ fontSize: 11 }}>{c.config.url ?? JSON.stringify(c.config)}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className="btn ghost" style={{ height: 28, padding: "0 10px", fontSize: 11 }} onClick={() => testChannel(project, c.id).catch((e) => setError(String(e)))}>Test</button>
                      <button className="btn danger" onClick={() => removeChannel(c.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
                      <th style={{ width: 52 }}>On</th>
                      <th>Name</th>
                      <th>Target</th>
                      <th>Condition</th>
                      <th style={{ width: 60 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.55 }}>
                        <td>
                          <label className="check" style={{ height: "auto" }}>
                            <input type="checkbox" checked={r.enabled} onChange={() => toggleRule(r)} />
                          </label>
                        </td>
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

          <div style={{ width: 460, flex: "none" }}>
            <div className="panel">
              <div className="panel-title"><span>Recent events</span><span className="hint">{events.length}</span></div>
              {events.length === 0 ? (
                <div className="empty">No alerts have fired.<div style={{ marginTop: 8 }}><code>go run ./cmd/cron</code></div></div>
              ) : (
                <table>
                  <thead>
                    <tr><th>Rule</th><th>State</th><th className="num">Value</th><th className="num">When</th></tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.ruleName}
                          <div className="hint">{e.service || "all"} · {e.metric}</div>
                        </td>
                        <td>{stateBadge(e.state)}</td>
                        <td className="num"><span className={e.state === "firing" ? "badge-err" : "badge-ok"}>{fmtValue(e)}</span></td>
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
