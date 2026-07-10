import type { IndustryMap } from "@devgraph/shared";
import { pool } from "../db";

export async function getIndustryMap(): Promise<IndustryMap> {
	const [nodes, edges, companies, nodeEvidence, edgeEvidence] =
		await Promise.all([
			pool.query(`
            SELECT id, canonical_name, node_type, description
            FROM industry_nodes
            ORDER BY id ASC`),
			pool.query(`
            SELECT id, source_node_id, target_node_id, edge_type, description
            FROM industry_edges
            ORDER BY id ASC`),
			pool.query(`
            SELECT
                cr.id,
                cr.industry_node_id,
                c.name AS company_name,
                c.is_listed,
                c.ticker,
                cr.role,
                cr.evidence_id
            FROM company_roles cr
            JOIN companies c ON c.id = cr.company_id
            ORDER BY c.name ASC, cr.role ASC`),
			pool.query(`
            SELECT
                ine.industry_node_id,
                e.id AS evidence_id,
                n.slug AS research_note_slug,
                n.title AS research_note_title,
                e.ordinal,
                e.text
            FROM industry_node_evidence ine
            JOIN evidence e ON e.id = ine.evidence_id
            JOIN research_notes n ON n.id = e.research_note_id
            ORDER BY ine.industry_node_id ASC, e.ordinal ASC`),
			pool.query(`
            SELECT
                iee.industry_edge_id,
                e.id AS evidence_id,
                n.slug AS research_note_slug,
                n.title AS research_note_title,
                e.ordinal,
                e.text
            FROM industry_edge_evidence iee
            JOIN evidence e ON e.id = iee.evidence_id
            JOIN research_notes n ON n.id = e.research_note_id
            ORDER BY iee.industry_edge_id ASC, e.ordinal ASC`),
		]);

	return {
		nodes: nodes.rows,
		edges: edges.rows,
		company_roles: companies.rows,
		node_evidence: nodeEvidence.rows,
		edge_evidence: edgeEvidence.rows,
	};
}
