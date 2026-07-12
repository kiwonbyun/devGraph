import type { GraphRevisionItem } from "@devgraph/shared";
import { pool } from "../db";

export interface GraphRevisionFilter {
	limit?: number | undefined;
	entityType?: string | undefined;
	action?: string | undefined;
}

export async function getGraphRevisions(
	filter: GraphRevisionFilter,
): Promise<GraphRevisionItem[]> {
	const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
	const result = await pool.query<GraphRevisionItem>(
		`SELECT
		     gr.id,
		     gr.entity_type,
		     gr.entity_id,
		     gr.action,
		     n.title AS research_note_title,
		     n.slug AS research_note_slug,
		     gr.extraction_run_id,
		     r.source AS extraction_run_source,
		     gr.detail,
		     gr.created_at
		 FROM graph_revisions gr
		 LEFT JOIN research_notes n ON n.id = gr.research_note_id
		 LEFT JOIN extraction_runs r ON r.id = gr.extraction_run_id
		 WHERE ($2::text IS NULL OR gr.entity_type = $2)
		   AND ($3::text IS NULL OR gr.action = $3)
		 ORDER BY gr.created_at DESC, gr.id DESC
		 LIMIT $1`,
		[limit, filter.entityType ?? null, filter.action ?? null],
	);
	return result.rows;
}
