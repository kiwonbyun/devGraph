import type {
	ExtractionCandidate,
	ExtractionRunDetail,
	ExtractionRunListItem,
} from "@devgraph/shared";
import { pool } from "../db";
import {
	type CompanyRoleCandidatePayload,
	type EdgeCandidatePayload,
	type NodeCandidatePayload,
	sampleCompanyRoleCandidates,
	sampleEdgeCandidates,
	sampleNodeCandidates,
} from "./sampleData";

type CandidateType = "node" | "edge" | "company_role";

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

		await client.query("COMMIT");
		return { id: runId };
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
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

export async function approveExtractionRun(runId: string): Promise<void> {
	const detail = await getExtractionRunDetail(runId);
	if (!detail) throw new Error(`Extraction run not found: ${runId}`);

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
	const nodeCandidates = detail.candidates.filter(
		(candidate) => candidate.candidate_type === "node",
	);
	const edgeCandidates = detail.candidates.filter(
		(candidate) => candidate.candidate_type === "edge",
	);
	const companyRoleCandidates = detail.candidates.filter(
		(candidate) => candidate.candidate_type === "company_role",
	);

	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		for (const candidate of nodeCandidates) {
			const payload = candidate.payload as NodeCandidatePayload;
			const result = await client.query<{ id: string }>(
				`INSERT INTO industry_nodes (canonical_name, node_type, description, updated_at)
                 VALUES ($1, $2, $3, now())
                 ON CONFLICT (canonical_name, node_type) DO UPDATE SET
                    description = EXCLUDED.description,
                    updated_at = now()
                 RETURNING id`,
				[payload.name, payload.node_type, payload.description],
			);
			const nodeId = result.rows[0]?.id;
			if (!nodeId) throw new Error(`Failed to approve node ${payload.name}`);
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
			const result = await client.query<{ id: string }>(
				`INSERT INTO industry_edges (source_node_id, target_node_id, edge_type, description, updated_at)
                 VALUES ($1, $2, $3, $4, now())
                 ON CONFLICT (source_node_id, target_node_id, edge_type) DO UPDATE SET
                    description = EXCLUDED.description,
                    updated_at = now()
                 RETURNING id`,
				[sourceNodeId, targetNodeId, payload.edge_type, payload.description],
			);
			const edgeId = result.rows[0]?.id;
			if (!edgeId) throw new Error("Failed to approve edge");
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
			const company = await client.query<{ id: string }>(
				`INSERT INTO companies (name, is_listed, ticker, updated_at)
                 VALUES ($1, $2, $3, now())
                 ON CONFLICT (name) DO UPDATE SET
                    is_listed = EXCLUDED.is_listed,
                    ticker = EXCLUDED.ticker,
                    updated_at = now()
                 RETURNING id`,
				[payload.company_name, payload.is_listed, payload.ticker],
			);
			const companyId = company.rows[0]?.id;
			const nodeId = nodeIds.get(payload.node_key);
			if (!companyId || !nodeId) {
				throw new Error(`Failed to approve company ${payload.company_name}`);
			}
			await client.query(
				`INSERT INTO company_roles (company_id, industry_node_id, role, evidence_id, updated_at)
                 VALUES ($1, $2, $3, $4, now())
                 ON CONFLICT (company_id, industry_node_id, role) DO UPDATE SET
                    evidence_id = EXCLUDED.evidence_id,
                    updated_at = now()`,
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
