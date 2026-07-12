-- 관리자가 직접 조정한 노드 좌표. NULL 이면 자동 레이아웃(dagre) 사용.
ALTER TABLE industry_nodes
    ADD COLUMN IF NOT EXISTS pos_x DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pos_y DOUBLE PRECISION;
