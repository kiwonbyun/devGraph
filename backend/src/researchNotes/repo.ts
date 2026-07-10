import { createHash } from "node:crypto";
import type {
	Evidence,
	ResearchNote,
	ResearchNoteListItem,
} from "@devgraph/shared";
import { pool } from "../db";

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

	await replaceEvidence(id, splitEvidenceParagraphs(note.body));
	return id;
}

export async function getResearchNotes(): Promise<ResearchNoteListItem[]> {
	const result = await pool.query<ResearchNoteListItem>(`
        SELECT slug, title, updated_at FROM research_notes
        ORDER BY updated_at DESC, title ASC`);

	return result.rows;
}

export async function getResearchNote(
	slug: string,
): Promise<ResearchNote | null> {
	const result = await pool.query<ResearchNote>(
		`
        SELECT id, slug, title, body, source_path, created_at, updated_at
        FROM research_notes WHERE slug = $1`,
		[slug],
	);
	return result.rows[0] ?? null;
}

export async function getEvidenceForResearchNote(
	slug: string,
): Promise<Evidence[]> {
	const result = await pool.query<Evidence>(
		`
        SELECT e.id, e.research_note_id, e.ordinal, e.text, e.content_hash, e.created_at, e.updated_at
        FROM evidence e
        JOIN research_notes n ON n.id = e.research_note_id
        WHERE n.slug = $1
        ORDER BY e.ordinal ASC`,
		[slug],
	);
	return result.rows;
}

async function replaceEvidence(
	researchNoteId: string,
	paragraphs: string[],
): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query("DELETE FROM evidence WHERE research_note_id = $1", [
			researchNoteId,
		]);

		for (const [index, text] of paragraphs.entries()) {
			await client.query(
				`INSERT INTO evidence (research_note_id, ordinal, text, content_hash, updated_at)
                 VALUES ($1, $2, $3, $4, now())`,
				[researchNoteId, index + 1, text, hashText(text)],
			);
		}

		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

function splitEvidenceParagraphs(markdown: string): string[] {
	return markdown
		.split(/\n\s*\n/g)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0);
}

function hashText(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}
