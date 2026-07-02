import Link from "next/link";

const FEATURES = [
  { href: "/explore", title: "Explore", desc: "Search traces by service, operation, tags, and duration", icon: "◎" },
  { href: "/live", title: "Live Tail", desc: "Watch spans stream in as they are ingested", icon: "〰" },
  { href: "/health", title: "Service Health", desc: "p50 / p95 / p99 latency and error hotspots", icon: "▁" },
  { href: "/service-map", title: "Service Map", desc: "Dependency graph from real trace parentage", icon: "◇" },
  { href: "/facets", title: "Tag Facets", desc: "Slice traffic by attribute values", icon: "≡" },
  { href: "/diff", title: "Trace Diff", desc: "Compare two traces side by side", icon: "↔" },
];

export default function LandingPage() {
  return (
    <>
      <div className="page-body">
        <div className="hero" style={{ marginBottom: 22 }}>
          <h2>Distributed tracing, instantly.</h2>
          <p className="lead">
            PathTrace follows every request across your services — which step was slow,
            where the error started, and how services depend on each other.
            Open the live demo with no login required.
          </p>
          <div className="actions">
            <Link href="/explore" className="btn">Open live demo</Link>
            <Link href="/connect" className="btn ghost">Connect your app</Link>
          </div>
        </div>

        <div className="section-label">Features</div>
        <div className="card-grid" style={{ marginBottom: 22 }}>
          {FEATURES.map((f) => (
            <Link key={f.href} href={f.href} className="scorecard landing-card">
              <div className="head">
                <div className="svc">
                  <span className="landing-card ic" style={{ fontSize: 16, width: 22 }}>{f.icon}</span>
                  {f.title}
                </div>
              </div>
              <p className="hint" style={{ margin: 0, lineHeight: 1.55 }}>{f.desc}</p>
            </Link>
          ))}
        </div>

        <div className="panel">
          <div className="panel-title">How it works</div>
          <div className="pipeline">
            <span className="node">Your apps</span>
            <span className="arr">→</span>
            <span className="node hl">OTLP ingest</span>
            <span className="arr">→</span>
            <span className="node">Postgres</span>
            <span className="arr">→</span>
            <span className="node hl">Query API</span>
            <span className="arr">→</span>
            <span className="node">This UI</span>
          </div>
        </div>
      </div>
    </>
  );
}
