# dev-graph MVP Implementation Plan

> **For agentic workers:** Executed inline in autonomous goal mode by the author. Steps use checkbox (`- [ ]`) syntax for tracking. Each phase is an independently testable deliverable verified locally.

**Goal:** Reach a locally-runnable, complete implementation of the GOAL.md MVP: an admin authors/publishes industry research, a real LLM extracts a candidate industry graph, the admin reviews/edits/adds/merges candidates and bulk-approves, re-extraction produces a reviewable diff, and public users explore the approved directed industry map (search, filter, minimap, mobile) with every displayed fact traceable to a published research paragraph.

**Architecture:** Node/Express + raw `pg` backend, React + Vite + TanStack Router/Query frontend, PostgreSQL (pgvector image, vector unused for MVP), shared TypeScript types in `@devgraph/shared`. Admin auth via a signed httpOnly session cookie gated by `ADMIN_PASSWORD`. LLM extraction via Anthropic Claude (`@anthropic-ai/sdk`) with structured JSON output; sample generator retained as dev fallback. Approval writes normalized graph rows + evidence links + an audit revision.

**Tech Stack:** Express 5, pg 8, React 19, TanStack Router/Query 5, @xyflow/react 12, @dagrejs/dagre 3, Tailwind 4, Anthropic SDK, node --test.

## Global Constraints

- Node `^20.19.0 || >=22.12.0` (use `.nvmrc` = v22.22.2; current shell may be 20.12.2 → `nvm use`).
- Package manager: pnpm 10.13.1, workspace with `backend`, `frontend`, `shared`.
- Migrations: SQL files in `backend/migrations`, applied in name order, idempotent (`IF NOT EXISTS`), now tracked in a `schema_migrations` table.
- BIGINT ids serialized as strings across the API/shared types.
- All public-map knowledge must trace to evidence from a `published` research note.
- No deploy. Verify everything locally (DB in docker `devgraph-db-1`, backend :8080, frontend vite dev :5173 proxy `/api`).
- Public read requires no login; all writes/extraction/review/approve/delete require admin.
- Sample extraction is dev-only and does NOT satisfy MVP criterion #2 (real LLM required).

---

## Phase 0 — Foundation & migration tracking
**Deliverable:** `schema_migrations` table records applied migrations; each migration runs in its own transaction; config module centralizes env. Backend still boots and serves existing endpoints.

- [ ] `schema_migrations(filename PK, applied_at)`; `migrate()` skips already-applied, wraps each file in BEGIN/COMMIT, logs applied.
- [ ] `backend/src/config.ts`: reads `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `CONTENT_DIR`; typed getters.
- [ ] `.env.example` updated with new keys.
- [ ] Verify: backend boots, `migrated`/`skip` logs correct, `/healthz` ok.

## Phase 1 — Admin auth + public/published split
**Deliverable:** Login with password → session cookie; `requireAdmin` middleware; research_notes gain `status` draft/published; public list/detail returns only published.

- [ ] Migration `0005_auth_and_status.sql`: `ALTER TABLE research_notes ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published'))`; index on status.
- [ ] Backend `auth/`: `POST /api/admin/login` (body {password}) → sets signed cookie; `POST /api/admin/logout`; `GET /api/admin/session` → {authenticated}. `requireAdmin` middleware verifies cookie HMAC. Use `cookie-parser` + `crypto` HMAC (no new heavy dep).
- [ ] Repo: `getPublishedResearchNotes`, `getPublishedResearchNote` (public); admin variants return all + status.
- [ ] Ingest sets status: keep existing notes; new ingested notes default draft, but seed content note → published (so map stays populated).
- [ ] Frontend: `lib/auth.ts` (session query + login/logout mutations), `/admin/login` route, admin layout guard.
- [ ] Verify: unauth write → 401; login → cookie; public list hides drafts.

## Phase 2 — Research note admin CRUD
**Deliverable:** Admin creates/edits/saves/publishes/unpublishes/deletes research notes in the web UI; evidence re-syncs on save; public sees only published.

- [ ] Backend admin routes: `POST /api/admin/research-notes` (title, body → slug from title, status draft), `PUT /api/admin/research-notes/:slug` (title, body, status), `POST .../publish`, `POST .../unpublish`, `DELETE`. Reuse `upsertResearchNote`/`syncEvidence`; add create/update-by-id variants that don't require source_path (set `manual`).
- [ ] Slug: slugify(title); ensure uniqueness (suffix -2 …).
- [ ] Frontend `/admin` note list (all statuses), `/admin/research-notes/new`, `/admin/research-notes/$slug/edit` with markdown textarea + live preview + save/publish/delete.
- [ ] Verify: create draft → not public → publish → public; edit body → evidence updates; delete removes.

## Phase 3 — Real LLM extraction
**Deliverable:** A real Claude call extracts candidate nodes/edges/node-relations/company-roles/clusters from a note's evidence, stored with raw response; sample path retained.

- [ ] `pnpm --filter backend add @anthropic-ai/sdk`.
- [ ] Migration `0006_extraction_llm.sql`: `extraction_runs ADD COLUMN raw_response JSONB, ADD COLUMN model TEXT, ADD COLUMN error TEXT`; drop/replace `source` check to allow `'llm'`; extend `extraction_candidates.candidate_type` check to add `'node_relation'`, `'cluster'`, `'alias'`. (Recreate check constraints.)
- [ ] `extractions/llm.ts`: builds prompt from note + numbered evidence; calls Claude with tool/JSON-schema forcing; parses to candidate payloads keyed like sampleData; returns {candidates, raw, model}. Graceful error if no `ANTHROPIC_API_KEY` (run status `error`, message surfaced).
- [ ] Route `POST /api/admin/research-notes/:slug/extraction-runs` (source=llm). Keep sample route under `/api/admin/...`.
- [ ] Extend `sampleData`/payload types + approval to handle node_relation, cluster, alias candidates.
- [ ] Frontend: primary "AI 추출 실행" (llm) button; sample button behind dev.
- [ ] Verify: with key set, run returns candidates + raw stored; without key, clear error state.

## Phase 4 — Review screen overhaul
**Deliverable:** Review screen shows candidate graph + original evidence side-by-side, structured per-type editing, manual add, duplicate/merge suggestions, include/exclude, bulk approve (all candidate types).

- [ ] Backend: `POST /api/admin/extraction-runs/:runId/candidates` (manual add), structured `PATCH` validation per candidate_type, duplicate lookup endpoint `GET /api/admin/industry-nodes/search?q=` for merge suggestions; approval maps candidate `merge_into_node_id` when set.
- [ ] Frontend review route → `/admin/extraction-runs/$runId`: three-pane (evidence | candidate graph (React Flow, reuse buildFlowGraph) | candidate list with structured forms). Per-node: name, type, description, evidence ordinals, merge-with-existing select. Per-edge: source/target (from candidate node keys), type, reverse button, evidence. Per company-role/relation/cluster forms. Manual add buttons.
- [ ] Verify: edit a node type, reverse an edge, exclude one, add a manual node, approve → map reflects exactly the included set.

## Phase 5 — Graph model completion (relations, aliases, clusters)
**Deliverable:** Approval persists node relations (is_a/part_of), node aliases, clusters + membership; industry map API returns them; public map can filter/highlight by cluster.

- [ ] Migration `0007_clusters_aliases.sql`: `node_aliases(id, node_id, alias, ...)`; `clusters(id, name, description, status)`; `cluster_nodes(cluster_id, node_id)`.
- [ ] Approval: node_relation candidate → `node_relations`; alias → `node_aliases`; cluster candidate (name + node_keys) → `clusters` + `cluster_nodes`.
- [ ] Industry map API adds `relations`, `aliases`, `clusters` (with node ids). Shared types extended.
- [ ] Verify: approve a cluster candidate → appears in map payload with member nodes.

## Phase 6 — Re-extraction diff workflow
**Deliverable:** Re-running extraction on a note with an existing approved graph produces a diff (added/modified/removed vs the graph currently backed by that note's evidence); approving applies only accepted changes; removals deactivate/unlink rather than hard-delete.

- [ ] Migration `0008_soft_delete_audit.sql`: `industry_nodes/edges ADD COLUMN is_active BOOLEAN DEFAULT TRUE`. (Map API filters `is_active`.)
- [ ] `extractions/diff.ts`: given new candidates + the note's currently-linked approved nodes/edges/roles, compute `diff_kind` (`add`/`modify`/`remove`/`unchanged`) per candidate; carry existing target id. Store on candidate payload.
- [ ] Approval honors diff_kind: add→create/link; modify→update+relink; remove→unlink this note's evidence, and if node/edge has no remaining evidence set `is_active=false`.
- [ ] Frontend diff view: group candidates by diff_kind with clear badges; only included ones apply.
- [ ] Verify: edit note text removing a fact, re-extract, see a `remove` diff, approve, map drops it (deactivated) while shared facts persist.

## Phase 7 — Public map exploration (search, filter, mobile)
**Deliverable:** Public users search nodes/companies/notes/evidence and jump viewport + open panel; filter by node type / edge type / company-role / cluster with non-matching dimmed; node detail as right sidebar (desktop) / bottom sheet (mobile).

- [ ] Frontend search box over map: index nodes (name/desc), company_roles (company/role), published notes (title), evidence (text). Result click → `reactFlowInstance.fitView`/`setCenter` on node + open panel; note/evidence result → navigate to note or focus linked node.
- [ ] Filter controls: node types, edge types, has-company, cluster select. Apply opacity dimming to non-matching nodes/edges (do not remove).
- [ ] Responsive drawer: `md:` right aside; `<md` bottom sheet. Ensure pan/zoom/search/filter usable on narrow viewport.
- [ ] Verify: search "하림" centers its node + panel; cluster filter dims others; resize to mobile shows bottom sheet.

## Phase 8 — Audit log (GraphRevision)
**Deliverable:** Graph-changing actions (approval, diff apply, admin manual edits) recorded with what/why/when.

- [ ] Migration (in 0008 or `0009_graph_revisions.sql`): `graph_revisions(id, entity_type, entity_id, action, research_note_id, extraction_run_id, detail JSONB, created_at)`.
- [ ] Write revision rows inside approval/diff transactions for each created/updated/deactivated entity.
- [ ] Verify: after an approval, `graph_revisions` has one row per applied change; not required in public UI.

## Phase 9 — SEO metadata + published gating polish
**Deliverable:** Public research pages and node detail set document title + meta description; drafts 404 for public.

- [ ] Lightweight `useDocumentMeta(title, description)` hook setting `document.title` + `<meta name=description>`; applied on note detail + node detail + home.
- [ ] Confirm public note detail endpoint 404s for draft; node detail only shows evidence from published notes.
- [ ] Verify: view source title changes per page; draft note URL → not found for public.

## Phase 10 — Seed + full local verification
**Deliverable:** End-to-end walkthrough of all 8 MVP success criteria passes locally.

- [ ] Ensure chicken/oil/soybean note published and map populated (re-approve if schema reset).
- [ ] Drive: login → create/edit/publish note → real LLM extract → review/edit/add/merge → bulk approve → map updates → node detail evidence → edit note → re-extract diff → approve → public search/filter/mobile.
- [ ] Run backend `pnpm --filter backend test:run`, both typechecks, biome check.
- [ ] Record results against the 8 criteria.

---

## Self-review notes
- Criterion 1 → P1/P2. Criterion 2 → P3/P5 (relations/alias/cluster candidates). Criterion 3 → P4. Criterion 4 → P6. Criterion 5 → P7 (mobile). Criterion 6 → P7 (search/filter/minimap). Criterion 7 → existing + P5/P9. Criterion 8 → P1 published gating + P9. Audit (MVP req) → P8. Auth (MVP req) → P1. Migration history (MVP req) → P0.
- Real LLM requires `ANTHROPIC_API_KEY`; module built to read env, surfaces clear error if absent — the single external credential dependency.
