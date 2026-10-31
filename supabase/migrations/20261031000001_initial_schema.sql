-- Satellite Collision Overview (Matrix) Initial Schema Migration
-- Enables Row Level Security (RLS) on all tables

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Datasets Table
CREATE TABLE IF NOT EXISTS datasets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename TEXT NOT NULL,
    storage_path TEXT,
    sha256_checksum TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    row_count INTEGER NOT NULL DEFAULT 0,
    encounter_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'parsing', 'ready', 'failed')),
    error_message TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_datasets_checksum ON datasets(sha256_checksum);
CREATE INDEX IF NOT EXISTS idx_datasets_status ON datasets(status);

-- 2. Telemetry Records Table
CREATE TABLE IF NOT EXISTS telemetry_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    source_row_number INTEGER NOT NULL,
    time_to_tca DOUBLE PRECISION,
    miss_distance DOUBLE PRECISION,
    relative_speed DOUBLE PRECISION,
    relative_position_r DOUBLE PRECISION,
    relative_position_t DOUBLE PRECISION,
    relative_position_n DOUBLE PRECISION,
    relative_velocity_r DOUBLE PRECISION,
    relative_velocity_t DOUBLE PRECISION,
    relative_velocity_n DOUBLE PRECISION,
    c_object_type TEXT,
    c_sigma_r DOUBLE PRECISION,
    t_sigma_r DOUBLE PRECISION,
    max_risk_estimate DOUBLE PRECISION,
    risk DOUBLE PRECISION,
    f10 DOUBLE PRECISION,
    ap DOUBLE PRECISION,
    mission_id TEXT,
    raw_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_telemetry_dataset_event ON telemetry_records(dataset_id, event_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_time_to_tca ON telemetry_records(dataset_id, time_to_tca);
CREATE INDEX IF NOT EXISTS idx_telemetry_row ON telemetry_records(dataset_id, source_row_number);

-- 3. Encounters Table
CREATE TABLE IF NOT EXISTS encounters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    latest_record_id UUID REFERENCES telemetry_records(id) ON DELETE SET NULL,
    message_count INTEGER NOT NULL DEFAULT 1,
    min_time_to_tca DOUBLE PRECISION NOT NULL,
    miss_distance DOUBLE PRECISION NOT NULL,
    relative_speed DOUBLE PRECISION,
    c_object_type TEXT NOT NULL DEFAULT 'UNKNOWN',
    source_pc DOUBLE PRECISION,
    predicted_pc DOUBLE PRECISION,
    operational_tier TEXT NOT NULL CHECK (operational_tier IN ('critical', 'elevated', 'safe', 'incomplete')),
    model_tier TEXT CHECK (model_tier IN ('critical', 'elevated', 'safe', 'incomplete', NULL)),
    classification_reasons TEXT[] NOT NULL DEFAULT '{}',
    review_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed', 'acknowledged', 'in_planning', 'reviewed')),
    mission_id TEXT,
    lat DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    lon DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    altitude_km DOUBLE PRECISION NOT NULL DEFAULT 500.0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_dataset_event UNIQUE (dataset_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_encounters_dataset ON encounters(dataset_id);
CREATE INDEX IF NOT EXISTS idx_encounters_tier ON encounters(operational_tier);
CREATE INDEX IF NOT EXISTS idx_encounters_status ON encounters(review_status);
CREATE INDEX IF NOT EXISTS idx_encounters_min_tca ON encounters(min_time_to_tca);

-- 4. Review States Table (Explicit tracking of workflow transitions)
CREATE TABLE IF NOT EXISTS review_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    review_status TEXT NOT NULL CHECK (review_status IN ('unreviewed', 'acknowledged', 'in_planning', 'reviewed')),
    acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_review_event UNIQUE (dataset_id, event_id)
);

-- 5. Plans Table (Manual planning decision support)
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    planning_status TEXT NOT NULL DEFAULT 'queued' CHECK (planning_status IN ('queued', 'assessing', 'reviewed')),
    assigned_operator TEXT,
    assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assessment_rationale TEXT,
    proposed_action TEXT,
    baseline_record_id UUID REFERENCES telemetry_records(id) ON DELETE SET NULL,
    baseline_pc DOUBLE PRECISION,
    baseline_miss_distance DOUBLE PRECISION,
    baseline_lead_time DOUBLE PRECISION,
    baseline_model_version TEXT,
    is_stale BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_plan_event UNIQUE (dataset_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(planning_status);
CREATE INDEX IF NOT EXISTS idx_plans_operator ON plans(assigned_operator);

-- 6. Audit Events Table (Append-only)
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    event_id TEXT,
    plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    operator_email TEXT NOT NULL DEFAULT 'system',
    operator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    previous_state JSONB,
    new_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_event_id ON audit_events(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit_events(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at DESC);

-- 7. Predictions Table (Persistent cache and tracking)
CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id TEXT NOT NULL UNIQUE,
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    record_id UUID NOT NULL REFERENCES telemetry_records(id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    prediction_target TEXT NOT NULL DEFAULT 'current_assessment',
    schema_version TEXT NOT NULL DEFAULT '1.0',
    request_payload JSONB NOT NULL,
    response_payload JSONB,
    pc DOUBLE PRECISION,
    model_classification TEXT,
    operational_classification TEXT,
    discrepancy_flag BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('not_requested', 'queued', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_predictions_record ON predictions(record_id, model_version);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);

-- 8. Display Positions Table (Simulated display coordinates)
CREATE TABLE IF NOT EXISTS display_positions (
    event_id TEXT PRIMARY KEY,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    altitude_km DOUBLE PRECISION NOT NULL,
    inclination DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. Jobs Table (Resumable batch processing)
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type TEXT NOT NULL,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    progress_current INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE display_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Read policies: Authenticated users can view datasets, records, encounters, and plans
CREATE POLICY "Public or Authenticated Read Datasets" ON datasets
    FOR SELECT USING (true);

CREATE POLICY "Public or Authenticated Read Records" ON telemetry_records
    FOR SELECT USING (true);

CREATE POLICY "Public or Authenticated Read Encounters" ON encounters
    FOR SELECT USING (true);

CREATE POLICY "Public or Authenticated Read Review States" ON review_states
    FOR SELECT USING (true);

CREATE POLICY "Public or Authenticated Read Plans" ON plans
    FOR SELECT USING (true);

CREATE POLICY "Public or Authenticated Read Audit Events" ON audit_events
    FOR SELECT USING (true);

CREATE POLICY "Public or Authenticated Read Predictions" ON predictions
    FOR SELECT USING (true);

CREATE POLICY "Public or Authenticated Read Positions" ON display_positions
    FOR SELECT USING (true);

-- Write policies: Restricted to authenticated users or service role
CREATE POLICY "Authenticated Insert Review States" ON review_states
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated Modify Plans" ON plans
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated Append Audit Events" ON audit_events
    FOR INSERT TO authenticated WITH CHECK (true);
