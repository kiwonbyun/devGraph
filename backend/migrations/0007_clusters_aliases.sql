-- 별칭: 노드를 부르는 다른 표기 (NodeAlias).
CREATE TABLE IF NOT EXISTS node_aliases (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id BIGINT NOT NULL REFERENCES industry_nodes(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (node_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_node_aliases_node_id ON node_aliases (node_id);

-- 산업 클러스터: 그래프 안에서 관리자가 확정한 노드 집합.
CREATE TABLE IF NOT EXISTS clusters (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cluster_nodes (
    cluster_id BIGINT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    node_id BIGINT NOT NULL REFERENCES industry_nodes(id) ON DELETE CASCADE,
    PRIMARY KEY (cluster_id, node_id)
);
