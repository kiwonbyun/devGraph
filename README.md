# dev-graph — 대한민국 산업지도

관리자가 작성·검수한 산업 리서치를 **근거 문단 단위**로 구조화해, 밸류체인과 기업 역할을
방향 지식 그래프로 누적하고 공개 웹에서 탐색하는 시스템. (전체 목표는 `GOAL.md`)

## 스택
- backend: Node 22 + Express 5 + raw `pg` (PostgreSQL, pgvector 이미지)
- frontend: React 19 + Vite + TanStack Router/Query + @xyflow/react + Tailwind 4
- shared: `@devgraph/shared` 타입 패키지 (pnpm workspace)
- LLM 추출: **Codex CLI(기본, ChatGPT 구독 사용·API 키 불필요)** 또는 OpenAI API(`openai` SDK). `LLM_PROVIDER`로 전환. json_schema 구조화 출력.

## 로컬 실행

전제: Docker, Node 22 (`.nvmrc`), pnpm 10.

```bash
# 1) DB
docker compose up -d db

# 2) 의존성
nvm use            # Node 22
pnpm install

# 3) 백엔드 (터미널 1) — 부팅 시 마이그레이션 실행 + content/*.md ingest
cp backend/.env.example backend/.env   # 이미 있으면 생략
pnpm --filter backend dev              # http://localhost:8080

# 4) 프론트엔드 (터미널 2)
pnpm --filter frontend dev             # http://localhost:5173  (/api → :8080 프록시)
```

- 공개 산업지도: <http://localhost:5173/>
- 관리자: <http://localhost:5173/admin> — 비밀번호는 `backend/.env` 의 `ADMIN_PASSWORD` (기본 `devgraph-admin`)

## 환경변수 (`backend/.env`)

| 키 | 설명 |
| --- | --- |
| `DATABASE_URL` | `postgresql://devgraph:devgraph@localhost:5432/devgraph` |
| `ADMIN_PASSWORD` | 단일 관리자 로그인 비밀번호 |
| `SESSION_SECRET` | 세션 쿠키 서명 키 |
| `LLM_PROVIDER` | `codex`(기본) 또는 `openai`. codex는 로컬 Codex CLI를 ChatGPT 로그인으로 사용 → **API 키 불필요**(ChatGPT 구독 사용량). |
| `CODEX_BIN` | codex 실행 경로(기본 `codex`). PATH에 없으면 절대경로 지정. 사전에 `codex login`(ChatGPT) 필요. |
| `CODEX_MODEL` | (선택) 비우면 Codex 기본 모델 |
| `OPENAI_API_KEY` | `LLM_PROVIDER=openai` 일 때만. 비어 있으면 "AI 추출 실행"이 명확한 에러 반환. |
| `OPENAI_MODEL` | 기본 `gpt-5-codex` (openai 경로) |
| `OPENAI_BASE_URL` | (선택) Azure/프록시 등 base URL 재정의 |

## 마이그레이션
`backend/migrations/*.sql` 를 이름순으로 실행하며 `schema_migrations` 로 적용 이력을 추적한다(각 파일 1트랜잭션·멱등). 부팅 시 자동 적용.

## 검증(품질 게이트)
```bash
pnpm --filter backend test:run   # 백엔드 빌드 + node:test
pnpm --filter frontend build     # 프론트 타입체크 + 빌드
pnpm check                       # biome (format + lint)
```

## MVP 흐름 요약
1. 관리자 로그인 → 리서치 글 작성/발행(`draft`/`published`)
2. 글에서 **AI 추출**(실제 LLM) 또는 샘플 추출 → 후보 생성
3. 검수 화면(원문 근거 | 후보 그래프 | 구조화 후보): 수정·제외·수동 추가·기존 노드 병합 → 일괄 승인
4. 승인 지식이 공개 산업지도에 반영 (노드/엣지/기업역할/계층/별칭/클러스터)
5. 글 수정 후 재추출 → diff(추가/수정/삭제) 검수 → 승인분만 반영(삭제는 비활성화)
6. 공개 사용자: 검색·필터·미니맵·모바일로 탐색, 노드 상세에서 근거 문단·원문까지 검증

승인/변경은 `graph_revisions`(감사 로그)에 기록된다.

## 최종 요구사항 반영

MVP를 넘어 GOAL.md의 최종 요구사항을 구현했다.

- **여러 산업 클러스터 누적**: 서로 다른 산업(예: 치킨/식용유 밸류체인 + 반도체 가치사슬)을 각각 리서치→추출→승인으로 누적. 공개 지도에서 클러스터 필터로 산업을 전환/강조.
- **관리자 노드 위치 편집**: `/admin/map`에서 노드를 드래그해 배치를 저장(`위치 저장`). 공개 지도는 저장 좌표를 우선 사용하고, 없으면 자동 레이아웃(dagre).
- **감사 로그 조회 UI**: `/admin/audit`에서 생성/수정/비활성화/삭제 이력을 원인(리서치/추출)과 함께 조회.
- **기업 canonical + 별칭 + 병합**: 검수 화면 기업 카드에서 기존 기업 검색·병합, 다른 표기는 `company_aliases`로 보존.
- **LLM 실행 메타데이터**: `extraction_runs`에 `model`, `prompt_version`, `input_note_version`(추출 시점 글 버전), `raw_response` 보존.
- **다중 출처 근거 강도**: 노드 상세에서 `근거 N개 · 리서치 M개`와 리서치별 근거 그룹으로 출처 흐름 표시.
- **SEO/공유**: 페이지별 Open Graph/Twitter/canonical 메타.

### 관리자 화면
- `/admin` 리서치 글 · `/admin/map` 지도 편집 · `/admin/audit` 감사 로그

