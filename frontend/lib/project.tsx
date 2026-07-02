"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "pathtrace_project";
const DEFAULT_PROJECT = process.env.NEXT_PUBLIC_DEMO_PROJECT || "demo";

type Ctx = {
  project: string;
  setProject: (p: string) => void;
};

const ProjectContext = createContext<Ctx>({
  project: DEFAULT_PROJECT,
  setProject: () => {},
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProjectState] = useState(DEFAULT_PROJECT);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setProjectState(saved);
  }, []);

  const setProject = (p: string) => {
    setProjectState(p);
    localStorage.setItem(STORAGE_KEY, p);
  };

  const value = useMemo(() => ({ project, setProject }), [project]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  return useContext(ProjectContext);
}

export { DEFAULT_PROJECT };
