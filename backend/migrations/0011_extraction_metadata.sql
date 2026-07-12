-- LLM 실행 메타데이터: 프롬프트 버전 + 추출 시점의 입력 글 버전(글 updated_at).
ALTER TABLE extraction_runs
    ADD COLUMN IF NOT EXISTS prompt_version TEXT,
    ADD COLUMN IF NOT EXISTS input_note_version TIMESTAMPTZ;
