# Phase 0 프론트엔드 — 설계 문서

작성일: 2026-07-04 · 상태: 설계 확정 대기 · 관련: [SPEC.md](../../../SPEC.md) Phase 0

---

## 1. 목적 · 범위

### 목적
Phase 0의 남은 반쪽을 채운다: 이미 동작하는 백엔드 JSON API 위에 **브라우저에서 보이는 읽기용 블로그**를 붙여 "걸어다니는 뼈대"를 완성한다.

### In-scope (지금 만든다)
- **글 목록 화면** (`/`) — `GET /api/articles`
- **글 읽기 화면** (`/articles/:slug`) — `GET /api/articles/:slug`, 본문 마크다운 렌더
- pnpm **워크스페이스** 전환 + **타입 공유 패키지**(`@devgraph/shared`)
- loading / error / 404 상태 처리

### Out-of-scope (지금 안 한다 — 근거)
- 그래프(3D/2D), 개념 페이지, 글 옆 로컬 그래프, 검색, 어드민 → **Phase 1/2** (SPEC 149~160줄)
- 프로덕션 정적 서빙(Node가 Vite build 서빙) → **Phase 0 배포 단계**에서. 지금은 개발 프록시만.
- 글 정체성(slug) 재설계 → **의도적으로 미룸.** 트립와이어는 8절 참고.

---

## 2. 기술 스택 · 결정 근거

| 영역 | 선택 | 근거 / 트레이드오프 |
|---|---|---|
| 빌드 | Vite + React + TypeScript | SPEC 33줄 확정 |
| 라우팅 | **TanStack Router (파일 기반)** | 타입 안전 라우팅, 포트폴리오·학습 값. codegen 스텝(`routeTree.gen.ts`) 붙음 |
| 데이터 | **axios + TanStack Query** | Query는 Phase 1(webhook 갱신 시 캐시 무효화·refetch)에서 진짜 값. 2페이지엔 과하지만 **학습 목적으로 의도된 선택** |
| 스타일 | **Tailwind CSS** | 모던 표준, 이후 그래프 UI에도 유리 |
| 마크다운 | **react-markdown** | SPEC 184줄 확정 |
| 타입 공유 | **`@devgraph/shared` (타입 전용, 빌드 없음)** | 4절 참고 |

> **"과한 스택"에 대한 정직한 기록:** TanStack Router/Query/axios는 정적 2페이지가 요구하는 수준보다 무겁다. 이는 *MVP를 빨리 내려는 게 아니라, 학습·포트폴리오를 위해 의식적으로 택한 것*이다. Query는 Phase 1에서 실제로 회수된다.

버전별 셋업(Tailwind v4 `@tailwindcss/vite` 플러그인 등)은 SPEC의 OpenAI 모델 확정 방식과 동일하게 **구현 착수 시 최신 공식 문서 기준으로 확정**한다.

---

## 3. 모노레포 · 워크스페이스 구조

현재는 워크스페이스가 아니다 — 루트와 `backend/`에 `pnpm-lock.yaml`이 **각각** 존재(backend가 독립 설치된 상태). 이를 단일 워크스페이스로 전환한다.

```
dev-graph/
  pnpm-workspace.yaml          # packages: backend, frontend, shared
  pnpm-lock.yaml               # ← 단일 lockfile로 통합
  package.json                 # 워크스페이스 루트
  backend/                     # 기존. repo.ts의 타입 → shared로 이동 후 되import
  shared/
    package.json               # @devgraph/shared (private, 타입 전용)
    src/index.ts               # API DTO 타입 정의
  frontend/                    # 신규 (5절)
  content/
```

전환 작업:
1. 루트에 `pnpm-workspace.yaml` 추가 (`backend`, `frontend`, `shared`)
2. `backend/pnpm-lock.yaml` **삭제** → 루트 단일 lockfile로 재설치
3. `shared/` 패키지 생성
4. backend·frontend가 `"@devgraph/shared": "workspace:*"`로 의존
5. (선택) 루트 `package.json` name을 `dev-graph-go` → `dev-graph`로 정리

---

## 4. 공유 패키지 `@devgraph/shared` (타입 전용)

### 원칙
런타임 코드 0, **타입만** 내보낸다. consumer가 `import type`으로 쓰면 컴파일 시 완전히 지워지므로 — 프론트(Vite)·백엔드(`tsx` 개발 + `tsc` 빌드 후 `node dist`) 모두 **런타임에 shared의 JS를 필요로 하지 않는다.** 따라서 빌드 스텝·빌드 순서 문제가 원천 발생하지 않는다.

```jsonc
// shared/package.json (핵심)
{
  "name": "@devgraph/shared",
  "private": true,
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

### 무엇을 담나 — "와이어(wire) 타입" (중요)
shared는 백엔드 **내부 DB row 타입이 아니라 API가 실제로 JSON으로 돌려주는 형태(DTO)**를 담는다. 이유는 실측으로 확인됨:

- `id`: node-postgres가 `BIGINT`를 **문자열**로 반환 → 상세 응답이 `"id":"1"` 이었음.
- 날짜(`published_at`, `created_at`, `updated_at`): `res.json`이 `Date`를 **ISO 문자열**로 직렬화.

```ts
// shared/src/index.ts (초안)
export interface ArticleListItem {
  slug: string;
  title: string;
  published_at: string | null;   // ISO 문자열 (Date 아님)
}

export interface Article {
  id: string;                    // pg BIGINT → 문자열
  slug: string;
  title: string;
  body: string;
  source_path: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
```

> **부수 발견:** 현재 `backend/src/articles/repo.ts`의 `Article`은 `id: number`, 날짜 `Date`로 되어 있어 **실제 와이어 형태와 불일치**한다(런타임 값은 문자열). 타입을 shared로 옮기면서 이 불일치를 어떻게 다룰지는 구현 시 결정 — 가장 단순한 길은 "DB row 타입"과 "API DTO 타입"을 분리하는 것. 지금 응답은 row를 그대로 반환하므로 DTO만 정의해도 프론트는 정확.

### 트립와이어
Phase 1에서 shared에 **런타임 코드**(예: front/back 공유 zod 검증 스키마, 상수)가 들어가는 순간 → `tsc` 빌드 + **TypeScript project references**로 승격한다. 이는 지금 것을 버리는 게 아니라 자연스러운 진화다.

---

## 5. 프론트엔드 아키텍처

```
frontend/src/
  main.tsx                 # QueryClientProvider + RouterProvider 부트스트랩
  routes/
    __root.tsx             # 루트 레이아웃 (공통 셸)
    index.tsx              # 글 목록  ← useArticles()
    articles.$slug.tsx     # 글 읽기  ← useArticle(slug) + react-markdown
    (routeTree.gen.ts)     # TanStack Router 플러그인 자동 생성 (커밋 대상 아님)
  lib/
    api.ts                 # axios 인스턴스 (baseURL '/api')
    queries.ts             # queryOptions 기반 훅: articlesQueryOptions, articleQueryOptions(slug)
  index.css                # Tailwind 엔트리
```

### 모듈 경계 (각 유닛의 단일 책임)
- **`lib/api.ts`** — HTTP 클라이언트 한 곳. baseURL·공통 에러/헤더(interceptor)를 여기서만. 다른 코드는 axios를 직접 모른다.
- **`lib/queries.ts`** — 서버 상태 정의(쿼리 키·fetcher·옵션). 컴포넌트는 "무엇을 가져오는지"만 알고 "어떻게"는 모른다.
- **`routes/*`** — 화면 = 쿼리 훅 소비 + 렌더. 데이터 취득 로직 없음.
- **`@devgraph/shared`** — 타입 계약. front/back이 같은 `Article` 형태를 공유해 드리프트 방지.

### 라우터 ↔ 쿼리 통합 (선택, 권장)
TanStack Router의 route `loader`에서 `queryClient.ensureQueryData(articleQueryOptions(slug))`로 **prefetch**하면 화면 전환이 매끄럽다. 필수는 아니며, 먼저 컴포넌트 내 `useQuery`로 단순하게 시작하고 이후 loader로 끌어올릴 수 있다.

---

## 6. 데이터 흐름

```
브라우저 ──(상대경로 /api/*)──► Vite dev 서버(proxy) ──► http://localhost:8080 (Node)
                                                              │
axios(baseURL '/api') ◄── TanStack Query ◄── 컴포넌트           ▼
                                                        PostgreSQL
```

- **개발**: Vite `server.proxy`로 `/api` → `:8080` 전달. CORS 불필요.
- **배포(나중)**: Node가 프론트 build와 API를 **동일 오리진**에서 서빙하므로, 프론트가 상대경로 `/api`를 쓰면 코드 변경 없이 그대로 동작. (실제 서빙 설정은 배포 단계 몫)

---

## 7. 상태 처리

TanStack Query의 `isPending` / `isError`를 사용:
- **목록**: 로딩 스켈레톤/스피너, 에러 시 재시도 안내, 빈 배열 시 "글 없음".
- **상세**: 로딩 표시. 에러 중 **404 구분** — axios 에러의 `error.response?.status === 404`이면 "글을 찾을 수 없음" 전용 뷰, 그 외는 일반 에러 뷰. (백엔드가 없는 slug에 404 반환하는 것 실측 확인됨.)

---

## 8. 열린 결정 · 트립와이어

- **글 정체성(slug) 미룸** — Phase 0는 slug=파일명 유지. 아래 셋 중 하나라도 하기 전 재검토: ① 파일명(=slug 원천) 변경, ② URL 공개·공유, ③ Phase 1 개념·그래프를 글에 연결. (그때 안: `public_id` 컬럼 + upsert 기준 변경 + slug 제목 파생.)
- **공유 패키지 빌드 승격** — shared에 런타임 코드 진입 시 project references로 (4절).
- **라우터 loader prefetch** — 단순 `useQuery`로 시작, 필요 시 도입 (5절).

---

## 9. 테스트 방침

Phase 0 프론트 규모(2화면)에 맞춘 **최소 셋업**:
- **Vitest + React Testing Library**로 목록/상세 컴포넌트의 loading·error·success 렌더를 검증. axios 모킹 또는 MSW로 API 응답을 가짜로 준다.
- QueryClient는 테스트마다 `retry: false`로 새로 생성.
- E2E(Playwright 등)는 Phase 0 범위 밖.

---

## 10. 완료 기준 (Phase 0 프론트 done)

1. pnpm 워크스페이스로 전환, 단일 lockfile, `shared`/`frontend`/`backend` 인식.
2. `@devgraph/shared`가 `Article`/`ArticleListItem` DTO 타입 제공, backend가 되import.
3. `pnpm dev`로 프론트 실행 → 목록에서 글이 보이고, 클릭 시 상세에서 마크다운 렌더.
4. loading·error·404 상태 동작.
5. Tailwind로 최소한 읽기 좋은 스타일 적용.
6. (배포/정적 서빙은 **별도 Phase 0 작업**으로 제외.)
