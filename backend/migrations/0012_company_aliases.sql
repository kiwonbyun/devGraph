-- 기업 별칭(canonical company + alias). 후보를 기존 기업과 병합할 때 다른 표기를 별칭으로 보존.
CREATE TABLE IF NOT EXISTS company_aliases (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_company_aliases_company_id
    ON company_aliases (company_id);
