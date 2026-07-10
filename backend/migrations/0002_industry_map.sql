CREATE TABLE IF NOT EXISTS research_notes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_notes_updated_at
    ON research_notes (updated_at DESC);

CREATE TABLE IF NOT EXISTS evidence (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    research_note_id BIGINT NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    text TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (research_note_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_evidence_research_note_id
    ON evidence (research_note_id);

CREATE TABLE IF NOT EXISTS industry_nodes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    node_type TEXT NOT NULL CHECK (node_type IN ('commodity', 'process', 'sector')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (canonical_name, node_type)
);

CREATE TABLE IF NOT EXISTS industry_edges (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_node_id BIGINT NOT NULL REFERENCES industry_nodes(id) ON DELETE CASCADE,
    target_node_id BIGINT NOT NULL REFERENCES industry_nodes(id) ON DELETE CASCADE,
    edge_type TEXT NOT NULL CHECK (
        edge_type IN (
            'flows_to',
            'produces',
            'uses',
            'operates_at',
            'supplies_to',
            'derived_from'
        )
    ),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_node_id, target_node_id, edge_type)
);

CREATE TABLE IF NOT EXISTS node_relations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_node_id BIGINT NOT NULL REFERENCES industry_nodes(id) ON DELETE CASCADE,
    target_node_id BIGINT NOT NULL REFERENCES industry_nodes(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL CHECK (
        relation_type IN ('same_as', 'alias_of', 'is_a', 'part_of')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_node_id, target_node_id, relation_type)
);

CREATE TABLE IF NOT EXISTS companies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    is_listed BOOLEAN NOT NULL DEFAULT FALSE,
    ticker TEXT,
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    industry_node_id BIGINT NOT NULL REFERENCES industry_nodes(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    evidence_id BIGINT REFERENCES evidence(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, industry_node_id, role)
);
