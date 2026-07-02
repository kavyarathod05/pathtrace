"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
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
  explore: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  live: <><path d="M4 12h4l2-6 4 12 2-6h4" /></>,
  health: <><path d="M4 15l4-8 4 12 3-7h5" /></>,
  map: <><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="12" cy="17" r="2.2" /><path d="M8 8l3 7M16 8l-3 7" /></>,
  facets: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  diff: <><path d="M12 4v16" /><path d="M7 8l-3 4 3 4M17 8l3 4-3 4" /></>,
  alerts: <><path d="M12 4a5 5 0 015 5v4l2 3H5l2-3V9a5 5 0 015-5z" /><path d="M10 20a2 2 0 004 0" /></>,
};

const NAV: { section: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    section: "Overview",
    items: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/connect", label: "Connect", icon: "connect" },
    ],
  },
  {
    section: "Observe",
    items: [
      { href: "/explore", label: "Explore", icon: "explore" },
      { href: "/live", label: "Live Tail", icon: "live" },
      { href: "/health", label: "Service Health", icon: "health" },
      { href: "/service-map", label: "Service Map", icon: "map" },
      { href: "/facets", label: "Facets", icon: "facets" },
      { href: "/diff", label: "Trace Diff", icon: "diff" },
      { href: "/alerts", label: "Alerts", icon: "alerts" },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();
  const [up, setUp] = useState<boolean | null>(null);
  const showProject = pathname !== "/" && pathname !== "/connect";

  useEffect(() => {
    let active = true;
    const ping = () => {
      fetch(`${API_BASE}/healthz`, { cache: "no-store" })
        .then((r) => active && setUp(r.ok))
        .catch(() => active && setUp(false));
    };
    ping();
    const id = setInterval(ping, 10000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        <svg className="glyph" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="5" cy="6" r="2.6" fill="#45b7a6" />
          <circle cx="5" cy="18" r="2.6" fill="#7d8bb0" />
          <circle cx="19" cy="12" r="2.6" fill="#d19a4e" />
          <path d="M7 6.6L17 11.4M7 17.4L17 12.6" stroke="#38424c" strokeWidth="1.5" />
        </svg>
        <div>
          <div className="name">PathTrace</div>
          <div className="tag">distributed tracing</div>
        </div>
      </Link>

      {showProject && <ProjectSelector />}

      <div className="nav-scroll">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="nav-section">{group.section}</div>
            {group.items.map((l) => (
              <Link key={l.href} href={l.href} className={`nav-link${isActive(l.href) ? " active" : ""}`}>
                <Icon path={ICONS[l.icon]} />
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="nav-foot">
        <span className={`status-dot ${up ? "up" : "down"}`} />
        {up === null ? "checking…" : up ? "backend connected" : "backend offline"}
      </div>
    </nav>
  );
}
