"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const TIME_WINDOWS = [
  { value: "15m", label: "15m", ms: 15 * 60_000 },
  { value: "1h", label: "1h", ms: 60 * 60_000 },
  { value: "6h", label: "6h", ms: 6 * 60 * 60_000 },
  { value: "24h", label: "24h", ms: 24 * 60 * 60_000 },
] as const;

export type TimeWindow = (typeof TIME_WINDOWS)[number]["value"];

const DEFAULT_WINDOW: TimeWindow = "1h";

const TIME_AWARE_PATHS = [
  "/",
  "/incidents",
  "/explore",
  "/monitor",
  "/health",
  "/errors",
  "/flame",
  "/service-map",
  "/facets",
  "/diff",
  "/live",
];

type TimeCtx = {
  window: TimeWindow;
  setWindow: (w: TimeWindow) => void;
  range: { start: string; end: string };
  refreshKey: number;
  refresh: () => void;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  showTimeBar: boolean;
};

const TimeContext = createContext<TimeCtx>({
  window: DEFAULT_WINDOW,
  setWindow: () => {},
  range: { start: "", end: "" },
  refreshKey: 0,
  refresh: () => {},
  autoRefresh: false,
  setAutoRefresh: () => {},
  showTimeBar: false,
});

export function windowToRange(win: string, endMs = Date.now()): { start: string; end: string } {
  const entry = TIME_WINDOWS.find((w) => w.value === win);
  const ms = entry?.ms ?? TIME_WINDOWS[1].ms;
  return {
    start: new Date(endMs - ms).toISOString(),
    end: new Date(endMs).toISOString(),
  };
}

export function TimeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const urlWindow = search.get("window") as TimeWindow | null;
  const [window, setWindowState] = useState<TimeWindow>(
    urlWindow && TIME_WINDOWS.some((w) => w.value === urlWindow) ? urlWindow : DEFAULT_WINDOW,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [endMs, setEndMs] = useState(() => Date.now());

  const showTimeBar = TIME_AWARE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  useEffect(() => {
    if (urlWindow && TIME_WINDOWS.some((w) => w.value === urlWindow)) {
      setWindowState(urlWindow);
    }
  }, [urlWindow]);

  useEffect(() => {
    if (!autoRefresh || !showTimeBar) return;
    const id = setInterval(() => {
      setEndMs(Date.now());
      setRefreshKey((k) => k + 1);
    }, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, showTimeBar]);

  const setWindow = useCallback(
    (w: TimeWindow) => {
      setWindowState(w);
      setEndMs(Date.now());
      if (!showTimeBar) return;
      const params = new URLSearchParams(search.toString());
      params.set("window", w);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, search, showTimeBar],
  );

  const refresh = useCallback(() => {
    setEndMs(Date.now());
    setRefreshKey((k) => k + 1);
  }, []);

  const range = useMemo(() => windowToRange(window, endMs), [window, endMs, refreshKey]);

  const value = useMemo(
    () => ({
      window,
      setWindow,
      range,
      refreshKey,
      refresh,
      autoRefresh,
      setAutoRefresh,
      showTimeBar,
    }),
    [window, setWindow, range, refreshKey, refresh, autoRefresh, showTimeBar],
  );

  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
}

export function useTimeWindow() {
  return useContext(TimeContext);
}
