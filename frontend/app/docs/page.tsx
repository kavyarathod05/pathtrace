"use client";

import { useEffect, useState } from "react";
import { API_BASE, fetchDocumentation } from "@/lib/api";
import { PageHeader } from "@/components/shell/PageHeader";
import type { Documentation, DocEndpoint, DocSection } from "@/lib/types";

function methodClass(m: string) {
  return `docs-method docs-method--${m.toLowerCase()}`;
}

function SectionBlock({ section }: { section: DocSection }) {
  return (
    <section id={section.id} className="docs-section intel-card">
      <h2 className="docs-section__title">{section.title}</h2>
      <div className="docs-section__body">{section.content}</div>
    </section>
  );
}

function EndpointRow({ ep }: { ep: DocEndpoint }) {
  return (
    <tr>
      <td><span className={methodClass(ep.method)}>{ep.method}</span></td>
      <td><code className="docs-path">{ep.path}</code></td>
      <td>
        <div>{ep.summary}</div>
        {ep.description && <div className="hint">{ep.description}</div>}
        {ep.params && ep.params.length > 0 && (
          <ul className="docs-params">
            {ep.params.map((p) => (
              <li key={p.name}>
                <code>{p.name}</code>
                {p.required && <span className="docs-required">required</span>}
                <span className="hint"> — {p.description}</span>
              </li>
            ))}
          </ul>
        )}
        {ep.example && <pre className="docs-example">{ep.example}</pre>}
      </td>
    </tr>
  );
}

export default function DocsPage() {
  const [doc, setDoc] = useState<Documentation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDocumentation()
      .then(setDoc)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <>
      <PageHeader
        title="Documentation"
        subtitle="PathTrace platform guide, API reference, and deployment"
        actions={
          <a href={`${API_BASE}/docs`} target="_blank" rel="noreferrer" className="btn ghost sm">
            API HTML docs
          </a>
        }
      />
      <div className="page-body docs-layout">
        {error && <div className="err-note">{error}</div>}
        {!doc && !error && <div className="empty"><div className="big">Loading documentation…</div></div>}
        {doc && (
          <>
            <aside className="docs-toc intel-card">
              <div className="panel-title" style={{ marginBottom: 10 }}>Contents</div>
              <nav className="docs-toc__nav">
                {doc.sections.map((s) => (
                  <a key={s.id} href={`#${s.id}`}>{s.title}</a>
                ))}
                <a href="#api">API reference</a>
                <a href="#ui">UI routes</a>
                <a href="#env">Environment variables</a>
              </nav>
              <div className="docs-meta">
                <div className="hint">Version {doc.version}</div>
                {doc.links.repo && (
                  <a href={doc.links.repo} className="link" target="_blank" rel="noreferrer">GitHub</a>
                )}
                {doc.links.api && (
                  <a href={`${doc.links.api}/api/docs`} className="link" target="_blank" rel="noreferrer">JSON API</a>
                )}
              </div>
            </aside>

            <div className="docs-main stack">
              <div className="intel-card docs-hero">
                <h2 style={{ margin: "0 0 8px" }}>{doc.title}</h2>
                <p style={{ margin: 0, color: "var(--text-dim)" }}>{doc.tagline}</p>
              </div>

              {doc.sections.map((s) => (
                <SectionBlock key={s.id} section={s} />
              ))}

              <section id="api" className="docs-section intel-card">
                <h2 className="docs-section__title">API reference</h2>
                <p className="hint" style={{ marginBottom: 16 }}>
                  Base URL: <code>{doc.links.api || API_BASE}</code> — all query routes accept <code>?project=</code>
                </p>
                {doc.endpoints.map((g) => (
                  <div key={g.title} className="docs-endpoint-group">
                    <h3 className="docs-group-title">{g.title}</h3>
                    <div className="health-table-wrap">
                      <table className="health-table docs-table">
                        <thead>
                          <tr>
                            <th>Method</th>
                            <th>Path</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.endpoints.map((ep) => (
                            <EndpointRow key={`${ep.method}-${ep.path}`} ep={ep} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </section>

              <section id="ui" className="docs-section intel-card">
                <h2 className="docs-section__title">UI routes</h2>
                <div className="health-table-wrap">
                  <table className="health-table docs-table">
                    <thead>
                      <tr>
                        <th>Path</th>
                        <th>Screen</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.uiRoutes.map((u) => (
                        <tr key={u.path}>
                          <td><code className="docs-path">{u.path}</code></td>
                          <td><strong>{u.title}</strong></td>
                          <td className="hint">{u.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section id="env" className="docs-section intel-card">
                <h2 className="docs-section__title">Environment variables</h2>
                <div className="health-table-wrap">
                  <table className="health-table docs-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.envVars.map((v) => (
                        <tr key={v.name}>
                          <td><code className="docs-path">{v.name}</code></td>
                          <td>{v.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
