-- 실제 LLM 추출 결과 저장을 위한 확장.
ALTER TABLE extraction_runs
    ADD COLUMN IF NOT EXISTS raw_response JSONB,
    ADD COLUMN IF NOT EXISTS model TEXT,
    ADD COLUMN IF NOT EXISTS error TEXT;

-- extraction_runs.status 에 'error' 상태 추가 (LLM 호출 실패 표현).
ALTER TABLE extraction_runs
    DROP CONSTRAINT IF EXISTS extraction_runs_status_check;
ALTER TABLE extraction_runs
    ADD CONSTRAINT extraction_runs_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'error'));

-- 후보 타입 확장: 계층 관계, 클러스터, 별칭.
ALTER TABLE extraction_candidates
    DROP CONSTRAINT IF EXISTS extraction_candidates_candidate_type_check;
ALTER TABLE extraction_candidates
    ADD CONSTRAINT extraction_candidates_candidate_type_check
    CHECK (
        candidate_type IN (
            'node',
            'edge',
            'company_role',
            'node_relation',
            'cluster',
            'alias'
        )
    );
