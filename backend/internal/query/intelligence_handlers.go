package query

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/pathtrace/pathtrace/internal/intelligence"
	"github.com/pathtrace/pathtrace/internal/model"
)

func (a *API) intelRunner() *intelligence.Runner {
	return intelligence.NewRunner(a.store, a.store.Pool())
}

func (a *API) handleIntelligenceOverview(w http.ResponseWriter, r *http.Request) {
	project := a.project(r)
	runner := a.intelRunner()
	ov, err := runner.Overview(r.Context(), project)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Demo project: materialize incidents on first read when telemetry exists but
	// the batch worker has not run yet (common after deploy or stale data).
	if project == a.cfg.DemoProject && ov.ActiveIncidents == 0 {
		if err := runner.EnsureDemoIncidents(r.Context(), project); err != nil {
			log.Printf("demo ensure incidents: %v", err)
		}
		if err := runner.RunProject(r.Context(), project); err != nil {
			log.Printf("demo intelligence run: %v", err)
		}
		if fresh, err := runner.Overview(r.Context(), project); err == nil {
			ov = fresh
		}
	}
	writeJSON(w, http.StatusOK, ov)
}

func (a *API) handleListIncidents(w http.ResponseWriter, r *http.Request) {
	project := a.project(r)
	status := r.URL.Query().Get("status")
	limit := atoiDefault(r.URL.Query().Get("limit"), 50)
	incidents, err := a.store.ListIncidents(r.Context(), project, status, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if incidents == nil {
		incidents = []model.Incident{}
	}
	if project == a.cfg.DemoProject && len(incidents) == 0 && status != "resolved" {
		runner := a.intelRunner()
		if err := runner.EnsureDemoIncidents(r.Context(), project); err != nil {
			log.Printf("demo ensure incidents: %v", err)
		}
		if err := runner.RunProject(r.Context(), project); err != nil {
			log.Printf("demo intelligence run: %v", err)
		}
		incidents, _ = a.store.ListIncidents(r.Context(), project, status, limit)
		if incidents == nil {
			incidents = []model.Incident{}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"incidents": incidents})
}

func (a *API) handleGetIncident(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	inc, err := a.store.GetIncident(r.Context(), a.project(r), id)
	if err != nil || inc == nil {
		writeErr(w, http.StatusNotFound, "incident not found")
		return
	}
	writeJSON(w, http.StatusOK, inc)
}

func (a *API) handleIncidentRCA(w http.ResponseWriter, r *http.Request) {
	inc, ok := a.loadIncident(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"incidentId": inc.ID,
		"rootCause":  inc.RootCause,
		"primary":    inc.PrimaryService,
	})
}

func (a *API) handleIncidentTimeline(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	events, err := a.store.ListIncidentEvents(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events})
}

func (a *API) handleIncidentBlast(w http.ResponseWriter, r *http.Request) {
	inc, ok := a.loadIncident(w, r)
	if !ok {
		return
	}
	edges, _ := a.store.ListServiceEdges(r.Context(), a.project(r))
	writeJSON(w, http.StatusOK, map[string]any{
		"blastRadius": inc.BlastRadius,
		"edges":       edges,
		"primary":     inc.PrimaryService,
	})
}

func (a *API) handleIncidentDebug(w http.ResponseWriter, r *http.Request) {
	inc, ok := a.loadIncident(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"playbook":  inc.Playbook,
		"rootCause": inc.RootCause,
	})
}

func (a *API) handleResolveIncident(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := a.store.ResolveIncident(r.Context(), a.project(r), id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "resolved"})
}

func (a *API) handleCreateDeployment(w http.ResponseWriter, r *http.Request) {
	var d model.Deployment
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&d); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	d.ProjectID = a.project(r)
	if d.Service == "" {
		writeErr(w, http.StatusBadRequest, "service is required")
		return
	}
	if d.ChangeType == "" {
		d.ChangeType = "deploy"
	}
	if d.DeployedAt.IsZero() {
		d.DeployedAt = time.Now()
	}
	id, err := a.store.CreateDeployment(r.Context(), d)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	d.ID = id
	writeJSON(w, http.StatusCreated, d)
}

func (a *API) loadIncident(w http.ResponseWriter, r *http.Request) (*model.Incident, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return nil, false
	}
	inc, err := a.store.GetIncident(r.Context(), a.project(r), id)
	if err != nil || inc == nil {
		writeErr(w, http.StatusNotFound, "incident not found")
		return nil, false
	}
	return inc, true
}
