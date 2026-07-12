import type {
	Evidence,
	ResearchNote,
	ResearchNoteListItem,
	ResearchNoteStatus,
} from "@devgraph/shared";
import { pool } from "../db";
import { planEvidenceSync, splitEvidenceParagraphs } from "./evidenceSync";

export interface ResearchNoteInput {
	slug: string;
	title: string;
	body: string;
	sourcePath: string;
}

export async function upsertResearchNote(
	note: ResearchNoteInput,
): Promise<string> {
	const result = await pool.query<{ id: string }>(
		`INSERT INTO research_notes (slug, title, body, source_path, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            body = EXCLUDED.body,
            source_path = EXCLUDED.source_path,
            updated_at = now()
         RETURNING id`,
		[note.slug, note.title, note.body, note.sourcePath],
	);

	const id = result.rows[0]?.id;
	if (!id) {
		throw new Error(`Failed to upsert research note: ${note.slug}`);
	}

	await syncEvidence(id, splitEvidenceParagraphs(note.body));
	return id;
}

export async function getResearchNotes(
	publishedOnly: boolean,
): Promise<ResearchNoteListItem[]> {
	const result = await pool.query<ResearchNoteListItem>(
		`SELECT slug, title, status, updated_at FROM research_notes
         WHERE ($1::boolean IS FALSE OR status = 'published')
         ORDER BY updated_at DESC, title ASC`,
		[publishedOnly],
	);

	return result.rows;
}

export async function getResearchNote(
	slug: string,
	publishedOnly: boolean,
): Promise<ResearchNote | null> {
	const result = await pool.query<ResearchNote>(
		`
        SELECT id, slug, title, body, status, source_path, created_at, updated_at
        FROM research_notes
        WHERE slug = $1 AND ($2::boolean IS FALSE OR status = 'published')`,
		[slug, publishedOnly],
	);
	return result.rows[0] ?? null;
}

export async function getEvidenceForResearchNote(
	slug: string,
	publishedOnly: boolean,
): Promise<Evidence[]> {
	const result = await pool.query<Evidence>(
		`
        SELECT e.id, e.research_note_id, e.ordinal, e.text, e.content_hash, e.created_at, e.updated_at
        FROM evidence e
        JOIN research_notes n ON n.id = e.research_note_id
        WHERE n.slug = $1 AND ($2::boolean IS FALSE OR n.status = 'published')
        ORDER BY e.ordinal ASC`,
		[slug, publishedOnly],
	);
	return result.rows;
}

export interface CreateResearchNoteInput {
	title: string;
	body: string;
}

export async function createResearchNote(
	input: CreateResearchNoteInput,
): Promise<ResearchNote> {
	const slug = await uniqueSlug(slugify(input.title) || "research-note");
	const result = await pool.query<{ id: string }>(
		`INSERT INTO research_notes (slug, title, body, source_path, status, updated_at)
		 VALUES ($1, $2, $3, 'manual', 'draft', now())
		 RETURNING id`,
		[slug, input.title, input.body],
	);
	const id = result.rows[0]?.id;
	if (!id) throw new Error("Failed to create research note");

	await syncEvidence(id, splitEvidenceParagraphs(input.body));

	const note = await getResearchNote(slug, false);
	if (!note) throw new Error("Failed to load created research note");
	return note;
}

export interface UpdateResearchNoteInput {
	title?: string;
	body?: string;
	status?: ResearchNoteStatus;
}

export async function updateResearchNote(
	slug: string,
	input: UpdateResearchNoteInput,
): Promise<ResearchNote | null> {
	const existing = await getResearchNote(slug, false);
	if (!existing) return null;

	const title = input.title ?? existing.title;
	const body = input.body ?? existing.body;
	const status = input.status ?? existing.status;

	await pool.query(
		`UPDATE research_notes
		 SET title = $2, body = $3, status = $4, updated_at = now()
		 WHERE slug = $1`,
		[slug, title, body, status],
	);

	if (input.body !== undefined && input.body !== existing.body) {
		await syncEvidence(existing.id, splitEvidenceParagraphs(body));
	}

	return getResearchNote(slug, false);
}

// 글을 삭제하면 그 글 근거로 추출됐던 노드/엣지/기업역할도 정리한다.
// 다른 글이 함께 근거로 쓰는 노드/엣지는 지우지 않고(공유 지식 보존) 이 글의 근거 연결만 사라진다.
export async function deleteResearchNote(slug: string): Promise<boolean> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		const note = await client.query<{ id: string }>(
			"SELECT id FROM research_notes WHERE slug = $1",
			[slug],
		);
		const noteId = note.rows[0]?.id;
		if (!noteId) {
			await client.query("ROLLBACK");
			return false;
		}

		// 삭제 전에 이 글 근거로 연결된 노드/엣지/기업역할 id 를 수집한다
		// (글을 지우면 근거 연결이 cascade 로 사라져 더 이상 못 찾는다).
		const nodeIds = (
			await client.query<{ id: string }>(
				`SELECT DISTINCT ine.industry_node_id AS id
				 FROM industry_node_evidence ine
				 JOIN evidence e ON e.id = ine.evidence_id
				 WHERE e.research_note_id = $1`,
				[noteId],
			)
		).rows.map((r) => r.id);
		const edgeIds = (
			await client.query<{ id: string }>(
				`SELECT DISTINCT iee.industry_edge_id AS id
				 FROM industry_edge_evidence iee
				 JOIN evidence e ON e.id = iee.evidence_id
				 WHERE e.research_note_id = $1`,
				[noteId],
			)
		).rows.map((r) => r.id);
		const roleIds = (
			await client.query<{ id: string }>(
				`SELECT cr.id
				 FROM company_roles cr
				 JOIN evidence e ON e.id = cr.evidence_id
				 WHERE e.research_note_id = $1`,
				[noteId],
			)
		).rows.map((r) => r.id);

		// 글 삭제: evidence·근거링크·추출run·후보 cascade, company_roles.evidence_id→NULL
		await client.query("DELETE FROM research_notes WHERE id = $1", [noteId]);

		// 이 글이 만든 기업 역할 제거(노드가 남아도 이 글의 주장은 삭제)
		if (roleIds.length > 0) {
			await client.query(
				"DELETE FROM company_roles WHERE id = ANY($1::bigint[])",
				[roleIds],
			);
		}

		// 남은 근거가 하나도 없어 고아가 된 노드 삭제(엣지/역할/관계/별칭/클러스터링크 cascade)
		if (nodeIds.length > 0) {
			await client.query(
				`DELETE FROM industry_nodes n
				 WHERE n.id = ANY($1::bigint[])
				   AND NOT EXISTS (
				     SELECT 1 FROM industry_node_evidence x WHERE x.industry_node_id = n.id
				   )`,
				[nodeIds],
			);
		}

		// 노드 삭제 후에도 남아있는 엣지 중 고아(근거 없음) 삭제
		if (edgeIds.length > 0) {
			await client.query(
				`DELETE FROM industry_edges ed
				 WHERE ed.id = ANY($1::bigint[])
				   AND NOT EXISTS (
				     SELECT 1 FROM industry_edge_evidence x WHERE x.industry_edge_id = ed.id
				   )`,
				[edgeIds],
			);
		}

		await client.query("COMMIT");
		return true;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
}

async function uniqueSlug(base: string): Promise<string> {
	let candidate = base;
	let n = 1;
	for (;;) {
		const existing = await pool.query(
			"SELECT 1 FROM research_notes WHERE slug = $1",
			[candidate],
		);
		if (existing.rowCount === 0) return candidate;
		n += 1;
		candidate = `${base}-${n}`;
	}
}

async function syncEvidence(
	researchNoteId: string,
	paragraphs: string[],
): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		const existing = await client.query<{
			id: string;
			content_hash: string;
			ordinal: number;
		}>(
			`SELECT id, content_hash, ordinal
			 FROM evidence
			 WHERE research_note_id = $1
			 ORDER BY ordinal ASC`,
			[researchNoteId],
		);
		const plan = planEvidenceSync(paragraphs, existing.rows);

		if (existing.rows.length > 0) {
			await client.query(
				`UPDATE evidence
				 SET ordinal = -ordinal, updated_at = now()
				 WHERE research_note_id = $1`,
				[researchNoteId],
			);
		}

		for (const item of plan.items) {
			if (item.existingId) {
				await client.query(
					`UPDATE evidence
					 SET ordinal = $2, text = $3, content_hash = $4, updated_at = now()
					 WHERE id = $1`,
					[item.existingId, item.ordinal, item.text, item.contentHash],
				);
				continue;
			}

			await client.query(
				`INSERT INTO evidence (research_note_id, ordinal, text, content_hash, updated_at)
				 VALUES ($1, $2, $3, $4, now())`,
				[researchNoteId, item.ordinal, item.text, item.contentHash],
			);
		}

		await client.query(
			`DELETE FROM evidence
			 WHERE research_note_id = $1 AND ordinal < 0`,
			[researchNoteId],
		);

		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}
