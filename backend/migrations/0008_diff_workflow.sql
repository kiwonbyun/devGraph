-- 소프트 삭제: 재추출 diff 에서 제거된 노드/엣지는 물리 삭제 대신 비활성화한다.
ALTER TABLE industry_nodes
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE industry_edges
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 후보의 diff 종류: add / modify / remove / unchanged (첫 추출은 NULL).
ALTER TABLE extraction_candidates
    ADD COLUMN IF NOT EXISTS diff_kind TEXT
    CHECK (diff_kind IN ('add', 'modify', 'remove', 'unchanged'));
