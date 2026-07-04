-- PathTrace schema. Runs on both embedded Postgres (local dev) and Render Postgres.

CREATE TABLE IF NOT EXISTS spans (
    project_id     TEXT         NOT NULL DEFAULT 'default',
    trace_id       TEXT         NOT NULL,
    span_id        TEXT         NOT NULL,
    parent_span_id TEXT,
    service_name   TEXT         NOT NULL,
    operation_name TEXT         NOT NULL,
    kind           TEXT,
    start_time     TIMESTAMPTZ  NOT NULL,
    duration_us    BIGINT       NOT NULL,
    status_code    TEXT,
    status_message TEXT,
    tags           JSONB        NOT NULL DEFAULT '{}',
    events         JSONB        NOT NULL DEFAULT '[]',
    refs           JSONB        NOT NULL DEFAULT '[]',
    PRIMARY KEY (project_id, trace_id, span_id)
);

CREATE INDEX IF NOT EXISTS idx_spans_service_time
    ON spans (project_id, service_name, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_spans_op_time
    ON spans (project_id, service_name, operation_name, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_spans_trace
    ON spans (project_id, trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_duration
    ON spans (duration_us);
CREATE INDEX IF NOT EXISTS idx_spans_start
    ON spans (project_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_spans_tags
    ON spans USING GIN (tags jsonb_path_ops);

CREATE TABLE IF NOT EXISTS alert_rules (
    id          BIGSERIAL PRIMARY KEY,
    project_id  TEXT NOT NULL DEFAULT 'default',
    name        TEXT NOT NULL,
    service     TEXT,
    metric      TEXT NOT NULL,
    op          TEXT NOT NULL,
    threshold   DOUBLE PRECISION NOT NULL,
    window_sec  INT NOT NULL DEFAULT 300
);

CREATE TABLE IF NOT EXISTS alert_events (
    id          BIGSERIAL PRIMARY KEY,
    rule_id     BIGINT REFERENCES alert_rules(id) ON DELETE CASCADE,
    fired_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    value       DOUBLE PRECISION NOT NULL,
    threshold   DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_events_fired ON alert_events (fired_at DESC);

-- Saved views (shareable filter presets)
CREATE TABLE IF NOT EXISTS saved_views (
    id          BIGSERIAL PRIMARY KEY,
    project_id  TEXT NOT NULL DEFAULT 'default',
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'explore',
    params      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_project ON saved_views (project_id, created_at DESC);

-- Notification channels for alerts
CREATE TABLE IF NOT EXISTS notification_channels (
    id          BIGSERIAL PRIMARY KEY,
    project_id  TEXT NOT NULL DEFAULT 'default',
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'webhook',
    config      JSONB NOT NULL DEFAULT '{}'
);

-- Alert rule extensions (idempotent ALTERs)
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS enabled BOOL NOT NULL DEFAULT true;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'warning';
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS for_sec INT NOT NULL DEFAULT 0;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS cooldown_sec INT NOT NULL DEFAULT 300;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS channel_id BIGINT REFERENCES notification_channels(id) ON DELETE SET NULL;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS slo_target DOUBLE PRECISION;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS slo_window_sec INT;

-- Stateful alert tracking
CREATE TABLE IF NOT EXISTS alert_state (
    rule_id         BIGINT PRIMARY KEY REFERENCES alert_rules(id) ON DELETE CASCADE,
    state           TEXT NOT NULL DEFAULT 'ok',
    since           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_notified   TIMESTAMPTZ
);

-- Alert event extensions
ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'firing';
ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'warning';

-- Intelligence layer: incidents, dependencies, baselines, deployments

CREATE TABLE IF NOT EXISTS services (
    project_id   TEXT NOT NULL,
    name         TEXT NOT NULL,
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, name)
);

CREATE TABLE IF NOT EXISTS service_edges (
    project_id   TEXT NOT NULL,
    parent       TEXT NOT NULL,
    child        TEXT NOT NULL,
    call_count   BIGINT NOT NULL DEFAULT 0,
    error_count  BIGINT NOT NULL DEFAULT 0,
    p95_us       BIGINT NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, parent, child)
);

CREATE TABLE IF NOT EXISTS service_baselines (
    project_id   TEXT NOT NULL,
    service      TEXT NOT NULL,
    window_min   INT NOT NULL DEFAULT 60,
    error_rate   DOUBLE PRECISION NOT NULL DEFAULT 0,
    p50_us       BIGINT NOT NULL DEFAULT 0,
    p95_us       BIGINT NOT NULL DEFAULT 0,
    p99_us       BIGINT NOT NULL DEFAULT 0,
    throughput   DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, service, window_min)
);

CREATE TABLE IF NOT EXISTS deployments (
    id           BIGSERIAL PRIMARY KEY,
    project_id   TEXT NOT NULL DEFAULT 'default',
    service      TEXT NOT NULL,
    version      TEXT,
    change_type  TEXT NOT NULL DEFAULT 'deploy',
    metadata     JSONB NOT NULL DEFAULT '{}',
    deployed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deployments_project_time
    ON deployments (project_id, deployed_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
    id              BIGSERIAL PRIMARY KEY,
    project_id      TEXT NOT NULL DEFAULT 'default',
    title           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',
    severity        INT NOT NULL,
    severity_label  TEXT NOT NULL,
    primary_service TEXT NOT NULL,
    root_cause      JSONB NOT NULL DEFAULT '{}',
    impacted        JSONB NOT NULL DEFAULT '[]',
    blast_radius    JSONB NOT NULL DEFAULT '[]',
    playbook        JSONB NOT NULL DEFAULT '[]',
    fingerprint     TEXT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL,
    resolved_at     TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_fingerprint
    ON incidents (project_id, fingerprint) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_incidents_project_status
    ON incidents (project_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS incident_events (
    id           BIGSERIAL PRIMARY KEY,
    incident_id  BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    service      TEXT,
    summary      TEXT NOT NULL,
    evidence     JSONB NOT NULL DEFAULT '{}',
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_events_time
    ON incident_events (incident_id, occurred_at);
