"use client";

import { useEffect, useState } from "react";
import { fetchProjects } from "@/lib/api";
import { useProject, DEFAULT_PROJECT } from "@/lib/project";

export function ProjectSelector() {
  const { project, setProject } = useProject();
  const [projects, setProjects] = useState<string[]>([DEFAULT_PROJECT]);

  useEffect(() => {
    fetchProjects()
      .then((list) => {
        const merged = new Set([DEFAULT_PROJECT, ...list]);
        setProjects([...merged].sort());
      })
      .catch(() => {});
  }, []);

  return (
    <div className="proj">
      <label>Project</label>
      <select value={project} onChange={(e) => setProject(e.target.value)}>
        {projects.map((p) => (
          <option key={p} value={p}>{p}{p === DEFAULT_PROJECT ? " · demo" : ""}</option>
        ))}
      </select>
    </div>
  );
}
