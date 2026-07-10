CREATE TABLE IF NOT EXISTS extraction_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    research_note_id BIGINT NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'sample',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_runs_research_note_id
    ON extraction_runs (research_note_id);

CREATE TABLE IF NOT EXISTS extraction_candidates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    extraction_run_id BIGINT NOT NULL REFERENCES extraction_runs(id) ON DELETE CASCADE,
    candidate_type TEXT NOT NULL CHECK (candidate_type IN ('node', 'edge', 'company_role')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_candidates_run_id
    ON extraction_candidates (extraction_run_id);
