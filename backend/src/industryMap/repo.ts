import type { IndustryMap } from "@devgraph/shared";
import { pool } from "../db";

export async function getIndustryMap(): Promise<IndustryMap> {
	const [
		nodes,
		edges,
		companies,
		nodeEvidence,
		edgeEvidence,
		relations,
		aliases,
		clusters,
	] = await Promise.all([
		pool.query(`
            SELECT id, canonical_name, node_type, description
            FROM industry_nodes
            WHERE is_active = TRUE
            ORDER BY id ASC`),
		pool.query(`
            SELECT ed.id, ed.source_node_id, ed.target_node_id, ed.edge_type, ed.description
            FROM industry_edges ed
            JOIN industry_nodes sn ON sn.id = ed.source_node_id AND sn.is_active
            JOIN industry_nodes tn ON tn.id = ed.target_node_id AND tn.is_active
            WHERE ed.is_active = TRUE
            ORDER BY ed.id ASC`),
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
		pool.query(`
            SELECT id, source_node_id, target_node_id, relation_type
            FROM node_relations
            ORDER BY id ASC`),
		pool.query(`
            SELECT id, node_id, alias
            FROM node_aliases
            ORDER BY node_id ASC, alias ASC`),
		pool.query(`
            SELECT
                c.id,
                c.name,
                c.description,
                COALESCE(
                    array_agg(cn.node_id::text ORDER BY cn.node_id)
                        FILTER (WHERE cn.node_id IS NOT NULL),
                    '{}'
                ) AS node_ids
            FROM clusters c
            LEFT JOIN cluster_nodes cn ON cn.cluster_id = c.id
            WHERE c.status = 'active'
            GROUP BY c.id, c.name, c.description
            ORDER BY c.name ASC`),
	]);

	return {
		nodes: nodes.rows,
		edges: edges.rows,
		company_roles: companies.rows,
		node_evidence: nodeEvidence.rows,
		edge_evidence: edgeEvidence.rows,
		relations: relations.rows,
		aliases: aliases.rows,
		clusters: clusters.rows,
	};
}
