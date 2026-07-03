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
