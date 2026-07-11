-- 리서치 글 공개 상태. 공개 사용자는 published 글만 볼 수 있다.
ALTER TABLE research_notes
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published'));

-- 기존에 ingest 된 글(치킨/식용유 밸류체인 seed)은 공개 상태로 둔다.
UPDATE research_notes SET status = 'published' WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_research_notes_status
    ON research_notes (status, updated_at DESC);
