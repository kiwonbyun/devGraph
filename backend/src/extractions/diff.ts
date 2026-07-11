import { pool } from "../db";
import type { CandidateType } from "./candidateTypes";
import type { ExtractionResult } from "./llm";

export type DiffKind = "add" | "modify" | "remove" | "unchanged";

export interface DiffItem {
	candidateType: CandidateType;
	diffKind: DiffKind;
	payload: unknown;
}

export interface ExistingNode {
	id: string;
	canonical_name: string;
	node_type: string;
	description: string | null;
}
export interface ExistingEdge {
	id: string;
	source_name: string;
	target_name: string;
	edge_type: string;
	description: string | null;
}
export interface ExistingRole {
	id: string;
	company_name: string;
	role: string;
	node_name: string;
}
export interface NoteGraph {
	nodes: ExistingNode[];
	edges: ExistingEdge[];
	roles: ExistingRole[];
}

export function isNoteGraphEmpty(graph: NoteGraph): boolean {
	return (
		graph.nodes.length === 0 &&
		graph.edges.length === 0 &&
		graph.roles.length === 0
	);
}

// 이 리서치 노트의 근거에 연결된 현재 승인 그래프 조각을 읽는다.
export async function loadNoteGraph(noteId: string): Promise<NoteGraph> {
	const [nodes, edges, roles] = await Promise.all([
		pool.query<ExistingNode>(
			`SELECT DISTINCT n.id, n.canonical_name, n.node_type, n.description
			 FROM industry_nodes n
			 JOIN industry_node_evidence ine ON ine.industry_node_id = n.id
			 JOIN evidence e ON e.id = ine.evidence_id
			 WHERE e.research_note_id = $1 AND n.is_active = TRUE`,
			[noteId],
		),
		pool.query<ExistingEdge>(
			`SELECT DISTINCT ed.id, sn.canonical_name AS source_name,
			        tn.canonical_name AS target_name, ed.edge_type, ed.description
			 FROM industry_edges ed
			 JOIN industry_edge_evidence iee ON iee.industry_edge_id = ed.id
			 JOIN evidence e ON e.id = iee.evidence_id
			 JOIN industry_nodes sn ON sn.id = ed.source_node_id
			 JOIN industry_nodes tn ON tn.id = ed.target_node_id
			 WHERE e.research_note_id = $1 AND ed.is_active = TRUE`,
			[noteId],
		),
		pool.query<ExistingRole>(
			`SELECT cr.id, c.name AS company_name, cr.role, n.canonical_name AS node_name
			 FROM company_roles cr
			 JOIN companies c ON c.id = cr.company_id
			 JOIN industry_nodes n ON n.id = cr.industry_node_id
			 JOIN evidence e ON e.id = cr.evidence_id
			 WHERE e.research_note_id = $1`,
			[noteId],
		),
	]);
	return { nodes: nodes.rows, edges: edges.rows, roles: roles.rows };
}

// 새 추출 결과를 기존 노트 그래프와 비교해 diff 항목을 만든다 (순수 함수).
export function buildDiff(
	result: ExtractionResult,
	existing: NoteGraph,
): DiffItem[] {
	const items: DiffItem[] = [];
	const keyToName = new Map(result.nodes.map((n) => [n.key, n.name]));

	// --- 노드 ---
	const matchedNodeIds = new Set<string>();
	for (const node of result.nodes) {
		const match = existing.nodes.find(
			(e) => e.canonical_name === node.name && e.node_type === node.node_type,
		);
		if (match) {
			matchedNodeIds.add(match.id);
			const changed = (match.description ?? "") !== (node.description ?? "");
			items.push({
				candidateType: "node",
				diffKind: changed ? "modify" : "unchanged",
				payload: { ...node, merge_into_node_id: match.id },
			});
		} else {
			items.push({ candidateType: "node", diffKind: "add", payload: node });
		}
	}
	for (const e of existing.nodes) {
		if (!matchedNodeIds.has(e.id)) {
			items.push({
				candidateType: "node",
				diffKind: "remove",
				payload: {
					key: `remove-node-${e.id}`,
					name: e.canonical_name,
					node_type: e.node_type,
					description: e.description ?? "",
					evidence_ordinals: [],
					existing_node_id: e.id,
				},
			});
		}
	}

	// --- 엣지 ---
	const matchedEdgeIds = new Set<string>();
	for (const edge of result.edges) {
		const srcName = keyToName.get(edge.source_key);
		const tgtName = keyToName.get(edge.target_key);
		const match = existing.edges.find(
			(e) =>
				e.source_name === srcName &&
				e.target_name === tgtName &&
				e.edge_type === edge.edge_type,
		);
		if (match) {
			matchedEdgeIds.add(match.id);
			const changed = (match.description ?? "") !== (edge.description ?? "");
			items.push({
				candidateType: "edge",
				diffKind: changed ? "modify" : "unchanged",
				payload: { ...edge, existing_edge_id: match.id },
			});
		} else {
			items.push({ candidateType: "edge", diffKind: "add", payload: edge });
		}
	}
	for (const e of existing.edges) {
		if (!matchedEdgeIds.has(e.id)) {
			items.push({
				candidateType: "edge",
				diffKind: "remove",
				payload: {
					source_key: `remove-${e.id}-src`,
					target_key: `remove-${e.id}-tgt`,
					edge_type: e.edge_type,
					description: `${e.source_name} → ${e.target_name}`,
					evidence_ordinals: [],
					existing_edge_id: e.id,
				},
			});
		}
	}

	// --- 기업 역할 (modify 없이 add/remove) ---
	const matchedRoleIds = new Set<string>();
	for (const role of result.company_roles) {
		const nodeName = keyToName.get(role.node_key);
		const match = existing.roles.find(
			(r) =>
				r.company_name === role.company_name &&
				r.node_name === nodeName &&
				r.role === role.role,
		);
		if (match) {
			matchedRoleIds.add(match.id);
			items.push({
				candidateType: "company_role",
				diffKind: "unchanged",
				payload: role,
			});
		} else {
			items.push({
				candidateType: "company_role",
				diffKind: "add",
				payload: role,
			});
		}
	}
	for (const r of existing.roles) {
		if (!matchedRoleIds.has(r.id)) {
			items.push({
				candidateType: "company_role",
				diffKind: "remove",
				payload: {
					company_name: r.company_name,
					is_listed: false,
					ticker: null,
					node_key: `remove-role-${r.id}`,
					role: r.role,
					evidence_ordinal: 0,
					existing_company_role_id: r.id,
				},
			});
		}
	}

	// --- 관계/별칭/클러스터는 diff 없이 add ---
	for (const relation of result.node_relations) {
		items.push({
			candidateType: "node_relation",
			diffKind: "add",
			payload: relation,
		});
	}
	for (const alias of result.aliases) {
		items.push({ candidateType: "alias", diffKind: "add", payload: alias });
	}
	for (const cluster of result.clusters) {
		items.push({ candidateType: "cluster", diffKind: "add", payload: cluster });
	}

	return items;
}
