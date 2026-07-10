CREATE TABLE IF NOT EXISTS industry_node_evidence (
    industry_node_id BIGINT NOT NULL REFERENCES industry_nodes(id) ON DELETE CASCADE,
    evidence_id BIGINT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    PRIMARY KEY (industry_node_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS industry_edge_evidence (
    industry_edge_id BIGINT NOT NULL REFERENCES industry_edges(id) ON DELETE CASCADE,
    evidence_id BIGINT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    PRIMARY KEY (industry_edge_id, evidence_id)
);
