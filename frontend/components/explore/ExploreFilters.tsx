"use client";

import type { SavedView, SearchParams } from "@/lib/types";

interface ExploreFiltersProps {
  form: SearchParams;
  setForm: (f: SearchParams) => void;
  services: string[];
  operations: string[];
  views: SavedView[];
  viewName: string;
  setViewName: (v: string) => void;
  onApply: () => void;
  onSaveView: () => void;
  onApplyView: (v: SavedView) => void;
  onRemoveView: (id: number) => void;
  loading: boolean;
}

export function ExploreFilters({
  form,
  setForm,
  services,
  operations,
  views,
  viewName,
  setViewName,
  onApply,
  onSaveView,
  onApplyView,
  onRemoveView,
  loading,
}: ExploreFiltersProps) {
  return (
    <aside className="explore-filters">
      <div className="explore-filters-head">
        <span className="section-label">Filters</span>
        <button type="button" className="btn ghost sm" onClick={onApply} disabled={loading}>
          {loading ? "…" : "Apply"}
        </button>
      </div>

      <div className="filter-group">
        <label>TraceQL</label>
        <textarea
          className="mono filter-traceql"
          rows={3}
          placeholder={'service="payments" && duration>250ms'}
          value={form.q ?? ""}
          onChange={(e) => setForm({ ...form, q: e.target.value || undefined })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onApply();
          }}
        />
      </div>

      <div className="filter-group">
        <label>Service</label>
        <select
          value={form.service ?? ""}
          onChange={(e) =>
            setForm({ ...form, service: e.target.value || undefined, operation: undefined })
          }
        >
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label>Operation</label>
        <select
          value={form.operation ?? ""}
          onChange={(e) => setForm({ ...form, operation: e.target.value || undefined })}
          disabled={!form.service}
        >
          <option value="">All operations</option>
          {operations.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-row">
        <div className="filter-group">
          <label>Min duration</label>
          <input
            placeholder="100ms"
            value={form.minDuration ?? ""}
            onChange={(e) => setForm({ ...form, minDuration: e.target.value || undefined })}
          />
        </div>
        <div className="filter-group">
          <label>Max duration</label>
          <input
            placeholder="2s"
            value={form.maxDuration ?? ""}
            onChange={(e) => setForm({ ...form, maxDuration: e.target.value || undefined })}
          />
        </div>
      </div>

      <div className="filter-group">
        <label>Tags</label>
        <input
          placeholder="http.route=POST /checkout"
          value={form.tags ?? ""}
          onChange={(e) => setForm({ ...form, tags: e.target.value || undefined })}
        />
      </div>

      <label className="check filter-check">
        <input
          type="checkbox"
          checked={!!form.onlyErrors}
          onChange={(e) => setForm({ ...form, onlyErrors: e.target.checked })}
        />
        Errors only
      </label>

      <div className="filter-divider" />

      <div className="filter-group">
        <label>Saved views</label>
        <div className="saved-view-input">
          <input
            placeholder="Name this view…"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveView();
            }}
          />
          <button type="button" className="btn ghost sm" onClick={onSaveView} disabled={!viewName}>
            Save
          </button>
        </div>
        <div className="saved-view-list">
          {views.length === 0 && <span className="hint">No saved views</span>}
          {views.map((v) => (
            <div key={v.id} className="saved-view-chip">
              <button type="button" onClick={() => onApplyView(v)}>
                {v.name}
              </button>
              <button
                type="button"
                className="remove"
                onClick={() => onRemoveView(v.id)}
                title="Delete view"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
