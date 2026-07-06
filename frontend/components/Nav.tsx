"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { API_BASE } from "@/lib/api";
import { ProjectSelector } from "@/components/ProjectSelector";

function Icon({ path, box = "0 0 24 24" }: { path: ReactNode; box?: string }) {
  return (
    <svg className="ic" viewBox={box} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {path}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  home: <><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></>,
  connect: <><path d="M8 12h8" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="12" r="2.5" /></>,
  incidents: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10 3h4l8 14H2L10 3z" /></>,
  rca: <><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 12h8M16 7l-2 3M16 17l-2-3" /></>,
  timeline: <><path d="M4 6h16M4 12h10M4 18h6" /></>,
  blast: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
  debug: <><path d="M12 3a4 4 0 014 4v2h2v8H6V9h2V7a4 4 0 014-4z" /></>,
  alerts: <><path d="M12 4a5 5 0 015 5v4l2 3H5l2-3V9a5 5 0 015-5z" /><path d="M10 20a2 2 0 004 0" /></>,
  traces: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
};

const NAV: { section: string; items: { href: string; label: string; icon: string; match?: "exact" | "prefix" }[] }[] = [
  {
    section: "Intelligence",
    items: [
      { href: "/", label: "System Overview", icon: "home", match: "exact" },
      { href: "/incidents", label: "Incidents", icon: "incidents", match: "prefix" },
    ],
  },
  {
    section: "Evidence",
    items: [
      { href: "/explore", label: "Trace Explorer", icon: "traces", match: "prefix" },
    ],
  },
  {
    section: "Configure",
    items: [
      { href: "/connect", label: "Connect", icon: "connect", match: "prefix" },
      { href: "/alerts", label: "Alerts", icon: "alerts", match: "prefix" },
    ],
  },
];

const INCIDENT_TABS = [
  { suffix: "", label: "Overview", icon: "incidents" },
  { suffix: "/rca", label: "Root Cause", icon: "rca" },
  { suffix: "/timeline", label: "Timeline", icon: "timeline" },
  { suffix: "/blast-radius", label: "Blast Radius", icon: "blast" },
  { suffix: "/debug", label: "Debug Assistant", icon: "debug" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [up, setUp] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const ping = () => {
      fetch(`${API_BASE}/healthz`, { cache: "no-store" })
        .then((r) => active && setUp(r.ok))
        .catch(() => active && setUp(false));
    };
    ping();
    const id = setInterval(ping, 10000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const isActive = (href: string, match: "exact" | "prefix" = "prefix") => {
    if (href === "/") return pathname === "/";
    if (match === "exact") return pathname === href;
    if (pathname === href) return true;
    if (href === "/incidents" && pathname.match(/^\/incidents\/\d+/)) return true;
    return pathname.startsWith(href + "/");
  };

  const incidentMatch = pathname.match(/^\/incidents\/(\d+)(\/.*)?$/);
  const incidentId = incidentMatch?.[1];
  const incidentPath = incidentId ? `/incidents/${incidentId}` : null;

  const incidentTabActive = (suffix: string) => {
    if (!incidentPath) return false;
    const full = `${incidentPath}${suffix}`;
    if (suffix === "") return pathname === incidentPath;
    return pathname === full || pathname.startsWith(full + "/");
  };

  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        <svg className="glyph" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="5" cy="6" r="2.6" fill="#0ea5a0" />
          <circle cx="5" cy="18" r="2.6" fill="#6366f1" />
          <circle cx="19" cy="12" r="2.6" fill="#e8910a" />
          <path d="M7 6.6L17 11.4M7 17.4L17 12.6" stroke="#5a6a7e" strokeWidth="1.5" />
        </svg>
        <div>
          <div className="name">PathTrace</div>
          <div className="tag">incident intelligence</div>
        </div>
      </Link>

      <ProjectSelector />

      <div className="nav-scroll">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="nav-section">{group.section}</div>
            {group.items.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`nav-link${isActive(l.href, l.match ?? "prefix") ? " active" : ""}`}
              >
                <Icon path={ICONS[l.icon]} />
                {l.label}
              </Link>
            ))}
          </div>
        ))}

        {incidentPath && (
          <div className="nav-incident-group">
            <div className="nav-section">Incident #{incidentId}</div>
            {INCIDENT_TABS.map((tab) => (
              <Link
                key={tab.suffix}
                href={`${incidentPath}${tab.suffix}`}
                className={`nav-link nav-link--sub${incidentTabActive(tab.suffix) ? " active" : ""}`}
              >
                <Icon path={ICONS[tab.icon]} />
                {tab.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="nav-foot">
        <span className={`status-dot ${up ? "up" : "down"}`} />
        {up === null ? "checking…" : up ? "backend connected" : "backend offline"}
      </div>
    </nav>
  );
}
