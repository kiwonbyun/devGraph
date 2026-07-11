import type {
	ExtractionCandidate,
	ExtractionCandidateStatus,
	ExtractionRunDetail,
	ExtractionRunListItem,
} from "@devgraph/shared";
import { pool } from "../db";
import type {
	AliasCandidatePayload,
	CandidateType,
	ClusterCandidatePayload,
	CompanyRoleCandidatePayload,
	EdgeCandidatePayload,
	NodeCandidatePayload,
	NodeRelationCandidatePayload,
} from "./candidateTypes";
import {
	buildDiff,
	type DiffKind,
	isNoteGraphEmpty,
	loadNoteGraph,
} from "./diff";
import {
	type ExtractionResult,
	extractGraphCandidates,
	LlmNotConfiguredError,
} from "./llm";
import {
	sampleAliasCandidates,
	sampleClusterCandidates,
	sampleCompanyRoleCandidates,
	sampleEdgeCandidates,
	sampleNodeCandidates,
	sampleNodeRelationCandidates,
} from "./sampleData";

type ReviewableCandidateStatus = Extract<
	ExtractionCandidateStatus,
	"pending" | "rejected"
>;

export async function createSampleExtractionRun(
	slug: string,
): Promise<{ id: string }> {
	const note = await pool.query<{ id: string }>(
		"SELECT id FROM research_notes WHERE slug = $1",
		[slug],
	);
	const researchNoteId = note.rows[0]?.id;
	if (!researchNoteId) {
		throw new Error(`Research note not found: ${slug}`);
	}

	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const run = await client.query<{ id: string }>(
			`INSERT INTO extraction_runs (research_note_id, status, source, updated_at)
             VALUES ($1, 'pending', 'sample', now())
             RETURNING id`,
			[researchNoteId],
		);
		const runId = run.rows[0]?.id;
		if (!runId) throw new Error("Failed to create extraction run");

		await insertCandidatesWithDiff(client, runId, researchNoteId, {
			nodes: sampleNodeCandidates,
			edges: sampleEdgeCandidates,
			company_roles: sampleCompanyRoleCandidates,
			node_relations: sampleNodeRelationCandidates,
			aliases: sampleAliasCandidates,
			clusters: sampleClusterCandidates,
		});

		await client.query("COMMIT");
		return { id: runId };
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

// 실제 LLM 을 호출해 후보를 생성한다. 실패하면 run 을 'error' 상태로 남긴다.
export async function createLlmExtractionRun(
	slug: string,
): Promise<{ id: string }> {
	const note = await pool.query<{ id: string; title: string }>(
		"SELECT id, title FROM research_notes WHERE slug = $1",
		[slug],
	);
	const researchNote = note.rows[0];
	if (!researchNote) {
		throw new Error(`Research note not found: ${slug}`);
	}

	const evidence = await pool.query<{ ordinal: number; text: string }>(
		"SELECT ordinal, text FROM evidence WHERE research_note_id = $1 ORDER BY ordinal ASC",
		[researchNote.id],
	);

	const run = await pool.query<{ id: string }>(
		`INSERT INTO extraction_runs (research_note_id, status, source, model, updated_at)
         VALUES ($1, 'pending', 'llm', $2, now())
         RETURNING id`,
		[researchNote.id, null],
	);
	const runId = run.rows[0]?.id;
	if (!runId) throw new Error("Failed to create extraction run");

	try {
		const extraction = await extractGraphCandidates({
			title: researchNote.title,
			evidence: evidence.rows,
		});

		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			await insertCandidatesWithDiff(
				client,
				runId,
				researchNote.id,
				extraction.result,
			);
			await client.query(
				"UPDATE extraction_runs SET raw_response = $2, model = $3, updated_at = now() WHERE id = $1",
				[runId, JSON.stringify(extraction.raw), extraction.model],
			);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}

		return { id: runId };
	} catch (error) {
		const message =
			error instanceof LlmNotConfiguredError
				? error.message
				: error instanceof Error
					? error.message
					: "LLM 추출에 실패했습니다.";
		await pool.query(
			"UPDATE extraction_runs SET status = 'error', error = $2, updated_at = now() WHERE id = $1",
			[runId, message],
		);
		throw error;
	}
}

export async function getExtractionRuns(
	slug: string,
): Promise<ExtractionRunListItem[]> {
	const result = await pool.query<ExtractionRunListItem>(
		`
        SELECT r.id, r.status, r.source, r.created_at, r.updated_at
        FROM extraction_runs r
        JOIN research_notes n ON n.id = r.research_note_id
        WHERE n.slug = $1
        ORDER BY r.created_at DESC`,
		[slug],
	);
	return result.rows;
}

export async function getExtractionRunDetail(
	runId: string,
): Promise<ExtractionRunDetail | null> {
	const run = await pool.query<ExtractionRunDetail>(
		`
        SELECT
            r.id,
            r.status,
            r.source,
            r.created_at,
            r.updated_at,
            n.slug AS research_note_slug,
            n.title AS research_note_title
        FROM extraction_runs r
        JOIN research_notes n ON n.id = r.research_note_id
        WHERE r.id = $1`,
		[runId],
	);
	const row = run.rows[0];
	if (!row) return null;

	const candidates = await pool.query<ExtractionCandidate>(
		`
        SELECT id, extraction_run_id, candidate_type, status, diff_kind, payload, created_at, updated_at
        FROM extraction_candidates
        WHERE extraction_run_id = $1
        ORDER BY
            CASE candidate_type
                WHEN 'node' THEN 1
                WHEN 'edge' THEN 2
                ELSE 3
            END,
            id ASC`,
		[runId],
	);

	return { ...row, candidates: candidates.rows };
}

export async function updateExtractionCandidate(
	candidateId: string,
	input: {
		status?: ReviewableCandidateStatus;
		payload?: unknown;
	},
): Promise<ExtractionCandidate | null> {
	const current = await pool.query<{
		run_status: string;
	}>(
		`
		SELECT r.status AS run_status
		FROM extraction_candidates c
		JOIN extraction_runs r ON r.id = c.extraction_run_id
		WHERE c.id = $1`,
		[candidateId],
	);
	const row = current.rows[0];
	if (!row) return null;
	if (row.run_status !== "pending") {
		throw new Error(
			"Cannot edit candidates after the extraction run is closed",
		);
	}

	const result = await pool.query<ExtractionCandidate>(
		`
		UPDATE extraction_candidates
		SET
			status = COALESCE($2::text, status),
			payload = COALESCE($3::jsonb, payload),
			updated_at = now()
		WHERE id = $1
		RETURNING id, extraction_run_id, candidate_type, status, diff_kind, payload, created_at, updated_at`,
		[
			candidateId,
			input.status ?? null,
			input.payload === undefined ? null : JSON.stringify(input.payload),
		],
	);
	return result.rows[0] ?? null;
}

// 검수 화면에서 수동으로 후보를 추가한다. run 이 pending 일 때만 허용.
export async function addExtractionCandidate(
	runId: string,
	candidateType: CandidateType,
	payload: unknown,
): Promise<ExtractionCandidate | null> {
	const run = await pool.query<{ status: string }>(
		"SELECT status FROM extraction_runs WHERE id = $1",
		[runId],
	);
	const status = run.rows[0]?.status;
	if (!status) return null;
	if (status !== "pending") {
		throw new Error("Cannot add candidates after the extraction run is closed");
	}

	const result = await pool.query<ExtractionCandidate>(
		`INSERT INTO extraction_candidates (extraction_run_id, candidate_type, payload, updated_at)
         VALUES ($1, $2, $3, now())
         RETURNING id, extraction_run_id, candidate_type, status, diff_kind, payload, created_at, updated_at`,
		[runId, candidateType, JSON.stringify(payload)],
	);
	return result.rows[0] ?? null;
}

// 병합 제안용: 이름으로 기존 산업 노드를 검색한다.
export async function searchIndustryNodes(
	q: string,
): Promise<{ id: string; canonical_name: string; node_type: string }[]> {
	const query = q.trim();
	if (!query) return [];
	const result = await pool.query<{
		id: string;
		canonical_name: string;
		node_type: string;
	}>(
		`SELECT id, canonical_name, node_type
		 FROM industry_nodes
		 WHERE canonical_name ILIKE '%' || $1 || '%'
		 ORDER BY canonical_name ASC
		 LIMIT 10`,
		[query],
	);
	return result.rows;
}

export async function approveExtractionRun(runId: string): Promise<void> {
	const detail = await getExtractionRunDetail(runId);
	if (!detail) throw new Error(`Extraction run not found: ${runId}`);
	if (detail.status !== "pending") {
		throw new Error(`Extraction run is already ${detail.status}`);
	}

	const note = await pool.query<{ id: string }>(
		"SELECT id FROM research_notes WHERE slug = $1",
		[detail.research_note_slug],
	);
	const researchNoteId = note.rows[0]?.id;
	if (!researchNoteId) {
		throw new Error(`Research note not found: ${detail.research_note_slug}`);
	}

	const evidence = await pool.query<{ id: string; ordinal: number }>(
		"SELECT id, ordinal FROM evidence WHERE research_note_id = $1",
		[researchNoteId],
	);
	const evidenceByOrdinal = new Map(
		evidence.rows.map((row) => [row.ordinal, row.id]),
	);
	const nodeIds = new Map<string, string>();
	const pendingCandidates = detail.candidates.filter(
		(candidate) => candidate.status === "pending",
	);
	const nodeCandidates = pendingCandidates.filter(
		(candidate) => candidate.candidate_type === "node",
	);
	const edgeCandidates = pendingCandidates.filter(
		(candidate) => candidate.candidate_type === "edge",
	);
	const companyRoleCandidates = pendingCandidates.filter(
		(candidate) => candidate.candidate_type === "company_role",
	);
	const relationCandidates = pendingCandidates.filter(
		(candidate) => candidate.candidate_type === "node_relation",
	);
	const aliasCandidates = pendingCandidates.filter(
		(candidate) => candidate.candidate_type === "alias",
	);
	const clusterCandidates = pendingCandidates.filter(
		(candidate) => candidate.candidate_type === "cluster",
	);

	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		for (const candidate of nodeCandidates) {
			const payload = candidate.payload as NodeCandidatePayload & {
				existing_node_id?: string;
			};
			if (candidate.diff_kind === "remove") {
				await removeNodeFromNote(
					client,
					payload.existing_node_id,
					researchNoteId,
				);
				await approveCandidate(client, candidate.id);
				continue;
			}
			const nodeId = await getOrCreateIndustryNode(client, payload);
			nodeIds.set(payload.key, nodeId);
			if (candidate.diff_kind === "modify") {
				await client.query(
					"UPDATE industry_nodes SET description = $2, is_active = TRUE, updated_at = now() WHERE id = $1",
					[nodeId, payload.description],
				);
			} else {
				await client.query(
					"UPDATE industry_nodes SET is_active = TRUE WHERE id = $1 AND is_active = FALSE",
					[nodeId],
				);
			}
			await linkEvidence(
				client,
				"industry_node_evidence",
				"industry_node_id",
				nodeId,
				payload.evidence_ordinals,
				evidenceByOrdinal,
			);
			await approveCandidate(client, candidate.id);
		}

		for (const candidate of edgeCandidates) {
			const payload = candidate.payload as EdgeCandidatePayload & {
				existing_edge_id?: string;
			};
			if (candidate.diff_kind === "remove") {
				await removeEdgeFromNote(
					client,
					payload.existing_edge_id,
					researchNoteId,
				);
				await approveCandidate(client, candidate.id);
				continue;
			}
			const sourceNodeId = nodeIds.get(payload.source_key);
			const targetNodeId = nodeIds.get(payload.target_key);
			if (!sourceNodeId || !targetNodeId) {
				// 참조하는 노드가 제외되었으면 이 엣지는 적용하지 않고 건너뛴다.
				continue;
			}
			const edgeId = await getOrCreateIndustryEdge(
				client,
				sourceNodeId,
				targetNodeId,
				payload,
			);
			if (candidate.diff_kind === "modify") {
				await client.query(
					"UPDATE industry_edges SET description = $2, is_active = TRUE, updated_at = now() WHERE id = $1",
					[edgeId, payload.description],
				);
			} else {
				await client.query(
					"UPDATE industry_edges SET is_active = TRUE WHERE id = $1 AND is_active = FALSE",
					[edgeId],
				);
			}
			await linkEvidence(
				client,
				"industry_edge_evidence",
				"industry_edge_id",
				edgeId,
				payload.evidence_ordinals,
				evidenceByOrdinal,
			);
			await approveCandidate(client, candidate.id);
		}

		for (const candidate of companyRoleCandidates) {
			const payload = candidate.payload as CompanyRoleCandidatePayload & {
				existing_company_role_id?: string;
			};
			if (candidate.diff_kind === "remove") {
				if (payload.existing_company_role_id) {
					await client.query("DELETE FROM company_roles WHERE id = $1", [
						payload.existing_company_role_id,
					]);
				}
				await approveCandidate(client, candidate.id);
				continue;
			}
			const nodeId = nodeIds.get(payload.node_key);
			if (!nodeId) {
				// 참조하는 노드가 제외되었으면 이 기업 역할은 건너뛴다.
				continue;
			}
			const companyId = await getOrCreateCompany(client, payload);
			await client.query(
				`INSERT INTO company_roles (company_id, industry_node_id, role, evidence_id, updated_at)
                 VALUES ($1, $2, $3, $4, now())
                 ON CONFLICT (company_id, industry_node_id, role) DO NOTHING`,
				[
					companyId,
					nodeId,
					payload.role,
					evidenceByOrdinal.get(payload.evidence_ordinal) ?? null,
				],
			);
			await approveCandidate(client, candidate.id);
		}

		for (const candidate of relationCandidates) {
			const payload = candidate.payload as NodeRelationCandidatePayload;
			const sourceNodeId = nodeIds.get(payload.source_key);
			const targetNodeId = nodeIds.get(payload.target_key);
			if (!sourceNodeId || !targetNodeId) continue;
			await client.query(
				`INSERT INTO node_relations (source_node_id, target_node_id, relation_type)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (source_node_id, target_node_id, relation_type) DO NOTHING`,
				[sourceNodeId, targetNodeId, payload.relation_type],
			);
			await approveCandidate(client, candidate.id);
		}

		for (const candidate of aliasCandidates) {
			const payload = candidate.payload as AliasCandidatePayload;
			const nodeId = nodeIds.get(payload.node_key);
			if (!nodeId) continue;
			await client.query(
				`INSERT INTO node_aliases (node_id, alias)
                 VALUES ($1, $2)
                 ON CONFLICT (node_id, alias) DO NOTHING`,
				[nodeId, payload.alias],
			);
			await approveCandidate(client, candidate.id);
		}

		for (const candidate of clusterCandidates) {
			const payload = candidate.payload as ClusterCandidatePayload;
			const clusterId = await getOrCreateCluster(client, payload);
			for (const nodeKey of payload.node_keys) {
				const nodeId = nodeIds.get(nodeKey);
				if (!nodeId) continue;
				await client.query(
					`INSERT INTO cluster_nodes (cluster_id, node_id)
                     VALUES ($1, $2)
                     ON CONFLICT DO NOTHING`,
					[clusterId, nodeId],
				);
			}
			await approveCandidate(client, candidate.id);
		}

		await client.query(
			"UPDATE extraction_runs SET status = 'approved', updated_at = now() WHERE id = $1",
			[runId],
		);
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

async function getOrCreateIndustryNode(
	client: Pick<typeof pool, "query">,
	payload: NodeCandidatePayload,
): Promise<string> {
	// 검수에서 기존 노드와 병합하도록 지정한 경우 그 노드를 그대로 사용한다.
	if (payload.merge_into_node_id) {
		const merged = await client.query<{ id: string }>(
			"SELECT id FROM industry_nodes WHERE id = $1",
			[payload.merge_into_node_id],
		);
		const mergedId = merged.rows[0]?.id;
		if (mergedId) return mergedId;
	}

	const insert = await client.query<{ id: string }>(
		`INSERT INTO industry_nodes (canonical_name, node_type, description, updated_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (canonical_name, node_type) DO NOTHING
		 RETURNING id`,
		[payload.name, payload.node_type, payload.description],
	);
	const insertedId = insert.rows[0]?.id;
	if (insertedId) return insertedId;

	const existing = await client.query<{ id: string }>(
		`SELECT id
		 FROM industry_nodes
		 WHERE canonical_name = $1 AND node_type = $2`,
		[payload.name, payload.node_type],
	);
	const existingId = existing.rows[0]?.id;
	if (!existingId) throw new Error(`Failed to approve node ${payload.name}`);
	return existingId;
}

async function getOrCreateIndustryEdge(
	client: Pick<typeof pool, "query">,
	sourceNodeId: string,
	targetNodeId: string,
	payload: EdgeCandidatePayload,
): Promise<string> {
	const insert = await client.query<{ id: string }>(
		`INSERT INTO industry_edges (source_node_id, target_node_id, edge_type, description, updated_at)
		 VALUES ($1, $2, $3, $4, now())
		 ON CONFLICT (source_node_id, target_node_id, edge_type) DO NOTHING
		 RETURNING id`,
		[sourceNodeId, targetNodeId, payload.edge_type, payload.description],
	);
	const insertedId = insert.rows[0]?.id;
	if (insertedId) return insertedId;

	const existing = await client.query<{ id: string }>(
		`SELECT id
		 FROM industry_edges
		 WHERE source_node_id = $1 AND target_node_id = $2 AND edge_type = $3`,
		[sourceNodeId, targetNodeId, payload.edge_type],
	);
	const existingId = existing.rows[0]?.id;
	if (!existingId) throw new Error("Failed to approve edge");
	return existingId;
}

async function getOrCreateCompany(
	client: Pick<typeof pool, "query">,
	payload: CompanyRoleCandidatePayload,
): Promise<string> {
	const insert = await client.query<{ id: string }>(
		`INSERT INTO companies (name, is_listed, ticker, updated_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (name) DO NOTHING
		 RETURNING id`,
		[payload.company_name, payload.is_listed, payload.ticker],
	);
	const insertedId = insert.rows[0]?.id;
	if (insertedId) return insertedId;

	const existing = await client.query<{ id: string }>(
		`SELECT id
		 FROM companies
		 WHERE name = $1`,
		[payload.company_name],
	);
	const existingId = existing.rows[0]?.id;
	if (!existingId) {
		throw new Error(`Failed to approve company ${payload.company_name}`);
	}
	return existingId;
}

// 삭제 diff: 이 노트의 근거 연결만 제거하고, 남은 근거가 없으면 노드를 비활성화한다.
async function removeNodeFromNote(
	client: Pick<typeof pool, "query">,
	nodeId: string | undefined,
	researchNoteId: string,
): Promise<void> {
	if (!nodeId) return;
	await client.query(
		`DELETE FROM industry_node_evidence
		 WHERE industry_node_id = $1
		   AND evidence_id IN (SELECT id FROM evidence WHERE research_note_id = $2)`,
		[nodeId, researchNoteId],
	);
	const remaining = await client.query<{ count: string }>(
		"SELECT count(*)::text AS count FROM industry_node_evidence WHERE industry_node_id = $1",
		[nodeId],
	);
	if (remaining.rows[0]?.count === "0") {
		await client.query(
			"UPDATE industry_nodes SET is_active = FALSE, updated_at = now() WHERE id = $1",
			[nodeId],
		);
	}
}

async function removeEdgeFromNote(
	client: Pick<typeof pool, "query">,
	edgeId: string | undefined,
	researchNoteId: string,
): Promise<void> {
	if (!edgeId) return;
	await client.query(
		`DELETE FROM industry_edge_evidence
		 WHERE industry_edge_id = $1
		   AND evidence_id IN (SELECT id FROM evidence WHERE research_note_id = $2)`,
		[edgeId, researchNoteId],
	);
	const remaining = await client.query<{ count: string }>(
		"SELECT count(*)::text AS count FROM industry_edge_evidence WHERE industry_edge_id = $1",
		[edgeId],
	);
	if (remaining.rows[0]?.count === "0") {
		await client.query(
			"UPDATE industry_edges SET is_active = FALSE, updated_at = now() WHERE id = $1",
			[edgeId],
		);
	}
}

async function getOrCreateCluster(
	client: Pick<typeof pool, "query">,
	payload: ClusterCandidatePayload,
): Promise<string> {
	const insert = await client.query<{ id: string }>(
		`INSERT INTO clusters (name, description, updated_at)
		 VALUES ($1, $2, now())
		 ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
		 RETURNING id`,
		[payload.name, payload.description],
	);
	const id = insert.rows[0]?.id;
	if (!id) throw new Error(`Failed to approve cluster ${payload.name}`);
	return id;
}

async function insertCandidate(
	client: Pick<typeof pool, "query">,
	runId: string,
	candidateType: CandidateType,
	payload: unknown,
	diffKind: DiffKind | null = null,
): Promise<void> {
	await client.query(
		`INSERT INTO extraction_candidates (extraction_run_id, candidate_type, payload, diff_kind, updated_at)
         VALUES ($1, $2, $3, $4, now())`,
		[runId, candidateType, JSON.stringify(payload), diffKind],
	);
}

// 첫 추출이면 diff 없이 그대로, 이미 승인 그래프가 있으면 diff 를 계산해 넣는다.
async function insertCandidatesWithDiff(
	client: Pick<typeof pool, "query">,
	runId: string,
	noteId: string,
	result: ExtractionResult,
): Promise<void> {
	const existing = await loadNoteGraph(noteId);
	if (isNoteGraphEmpty(existing)) {
		const plain: [CandidateType, unknown[]][] = [
			["node", result.nodes],
			["edge", result.edges],
			["company_role", result.company_roles],
			["node_relation", result.node_relations],
			["alias", result.aliases],
			["cluster", result.clusters],
		];
		for (const [type, payloads] of plain) {
			for (const payload of payloads) {
				await insertCandidate(client, runId, type, payload, null);
			}
		}
		return;
	}

	for (const item of buildDiff(result, existing)) {
		await insertCandidate(
			client,
			runId,
			item.candidateType,
			item.payload,
			item.diffKind,
		);
	}
}

async function approveCandidate(
	client: Pick<typeof pool, "query">,
	candidateId: string,
): Promise<void> {
	await client.query(
		"UPDATE extraction_candidates SET status = 'approved', updated_at = now() WHERE id = $1",
		[candidateId],
	);
}

async function linkEvidence(
	client: Pick<typeof pool, "query">,
	table: "industry_node_evidence" | "industry_edge_evidence",
	idColumn: "industry_node_id" | "industry_edge_id",
	id: string,
	ordinals: number[],
	evidenceByOrdinal: Map<number, string>,
): Promise<void> {
	for (const ordinal of ordinals) {
		const evidenceId = evidenceByOrdinal.get(ordinal);
		if (!evidenceId) continue;
		await client.query(
			`INSERT INTO ${table} (${idColumn}, evidence_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
			[id, evidenceId],
		);
	}
}
