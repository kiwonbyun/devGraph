-- 감사 로그: 승인/재추출 diff 로 인해 그래프가 어떻게 바뀌었는지 추적한다.
CREATE TABLE IF NOT EXISTS graph_revisions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id BIGINT,
    action TEXT NOT NULL CHECK (
        action IN ('create', 'update', 'deactivate', 'delete')
    ),
    research_note_id BIGINT REFERENCES research_notes(id) ON DELETE SET NULL,
    extraction_run_id BIGINT REFERENCES extraction_runs(id) ON DELETE SET NULL,
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_revisions_created_at
    ON graph_revisions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_graph_revisions_run
    ON graph_revisions (extraction_run_id);
