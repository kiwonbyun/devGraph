import type {
	ExtractionCandidate,
	ExtractionCandidateStatus,
	ExtractionRunDetail,
	ExtractionRunListItem,
} from "@devgraph/shared";
import { pool } from "../db";
import type {
	CandidateType,
	CompanyRoleCandidatePayload,
	EdgeCandidatePayload,
	NodeCandidatePayload,
} from "./candidateTypes";
import { extractGraphCandidates, LlmNotConfiguredError } from "./llm";
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

		for (const payload of sampleNodeCandidates) {
			await insertCandidate(client, runId, "node", payload);
		}
		for (const payload of sampleEdgeCandidates) {
			await insertCandidate(client, runId, "edge", payload);
		}
		for (const payload of sampleCompanyRoleCandidates) {
			await insertCandidate(client, runId, "company_role", payload);
		}
		for (const payload of sampleNodeRelationCandidates) {
			await insertCandidate(client, runId, "node_relation", payload);
		}
		for (const payload of sampleAliasCandidates) {
			await insertCandidate(client, runId, "alias", payload);
		}
		for (const payload of sampleClusterCandidates) {
			await insertCandidate(client, runId, "cluster", payload);
		}

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
			for (const payload of extraction.result.nodes) {
				await insertCandidate(client, runId, "node", payload);
			}
			for (const payload of extraction.result.edges) {
				await insertCandidate(client, runId, "edge", payload);
			}
			for (const payload of extraction.result.company_roles) {
				await insertCandidate(client, runId, "company_role", payload);
			}
			for (const payload of extraction.result.node_relations) {
				await insertCandidate(client, runId, "node_relation", payload);
			}
			for (const payload of extraction.result.aliases) {
				await insertCandidate(client, runId, "alias", payload);
			}
			for (const payload of extraction.result.clusters) {
				await insertCandidate(client, runId, "cluster", payload);
			}
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
        SELECT id, extraction_run_id, candidate_type, status, payload, created_at, updated_at
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
		RETURNING id, extraction_run_id, candidate_type, status, payload, created_at, updated_at`,
		[
			candidateId,
			input.status ?? null,
			input.payload === undefined ? null : JSON.stringify(input.payload),
		],
	);
	return result.rows[0] ?? null;
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

	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		for (const candidate of nodeCandidates) {
			const payload = candidate.payload as NodeCandidatePayload;
			const nodeId = await getOrCreateIndustryNode(client, payload);
			nodeIds.set(payload.key, nodeId);
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
			const payload = candidate.payload as EdgeCandidatePayload;
			const sourceNodeId = nodeIds.get(payload.source_key);
			const targetNodeId = nodeIds.get(payload.target_key);
			if (!sourceNodeId || !targetNodeId) {
				throw new Error(
					`Missing node for edge ${payload.source_key} -> ${payload.target_key}`,
				);
			}
			const edgeId = await getOrCreateIndustryEdge(
				client,
				sourceNodeId,
				targetNodeId,
				payload,
			);
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
			const payload = candidate.payload as CompanyRoleCandidatePayload;
			const companyId = await getOrCreateCompany(client, payload);
			const nodeId = nodeIds.get(payload.node_key);
			if (!companyId || !nodeId) {
				throw new Error(`Failed to approve company ${payload.company_name}`);
			}
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

async function insertCandidate(
	client: Pick<typeof pool, "query">,
	runId: string,
	candidateType: CandidateType,
	payload: unknown,
): Promise<void> {
	await client.query(
		`INSERT INTO extraction_candidates (extraction_run_id, candidate_type, payload, updated_at)
         VALUES ($1, $2, $3, now())`,
		[runId, candidateType, JSON.stringify(payload)],
	);
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
