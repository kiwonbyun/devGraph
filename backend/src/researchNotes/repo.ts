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

export async function deleteResearchNote(slug: string): Promise<boolean> {
	const result = await pool.query(
		"DELETE FROM research_notes WHERE slug = $1",
		[slug],
	);
	return (result.rowCount ?? 0) > 0;
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
