export type ResearchNoteStatus = "draft" | "published";

export interface ResearchNoteListItem {
	slug: string;
	title: string;
	status: ResearchNoteStatus;
	updated_at: string;
}

export interface ResearchNote {
	id: string; // pg BIGINT → 문자열
	slug: string;
	title: string;
	body: string;
	status: ResearchNoteStatus;
	source_path: string;
	created_at: string;
	updated_at: string;
}

export interface Evidence {
	id: string;
	research_note_id: string;
	ordinal: number;
	text: string;
	content_hash: string;
	created_at: string;
	updated_at: string;
}

export type IndustryNodeType = "commodity" | "process" | "sector";

export type IndustryEdgeType =
	| "flows_to"
	| "produces"
	| "uses"
	| "operates_at"
	| "supplies_to"
	| "derived_from";

export type NodeRelationType = "same_as" | "alias_of" | "is_a" | "part_of";

export interface IndustryNode {
	id: string;
	canonical_name: string;
	node_type: IndustryNodeType;
	description: string | null;
	pos_x: number | null;
	pos_y: number | null;
}

export interface IndustryNodeSearchResult {
	id: string;
	canonical_name: string;
	node_type: IndustryNodeType;
}

export interface IndustryEdge {
	id: string;
	source_node_id: string;
	target_node_id: string;
	edge_type: IndustryEdgeType;
	description: string | null;
}

export interface CompanyRole {
	id: string;
	industry_node_id: string;
	company_name: string;
	is_listed: boolean;
	ticker: string | null;
	role: string;
	evidence_id: string | null;
}

export interface IndustryNodeEvidence {
	industry_node_id: string;
	evidence_id: string;
	research_note_slug: string;
	research_note_title: string;
	ordinal: number;
	text: string;
}

export interface IndustryEdgeEvidence {
	industry_edge_id: string;
	evidence_id: string;
	research_note_slug: string;
	research_note_title: string;
	ordinal: number;
	text: string;
}

export interface IndustryNodeRelation {
	id: string;
	source_node_id: string;
	target_node_id: string;
	relation_type: NodeRelationType;
}

export interface NodeAlias {
	id: string;
	node_id: string;
	alias: string;
}

export interface IndustryCluster {
	id: string;
	name: string;
	description: string | null;
	node_ids: string[];
}

export interface IndustryMap {
	nodes: IndustryNode[];
	edges: IndustryEdge[];
	company_roles: CompanyRole[];
	node_evidence: IndustryNodeEvidence[];
	edge_evidence: IndustryEdgeEvidence[];
	relations: IndustryNodeRelation[];
	aliases: NodeAlias[];
	clusters: IndustryCluster[];
}

export type ExtractionRunStatus = "pending" | "approved" | "rejected";
export type ExtractionCandidateStatus = "pending" | "approved" | "rejected";
export type ExtractionCandidateType =
	| "node"
	| "edge"
	| "company_role"
	| "node_relation"
	| "cluster"
	| "alias";

export interface ExtractionRunListItem {
	id: string;
	status: ExtractionRunStatus;
	source: string;
	created_at: string;
	updated_at: string;
}

export type ExtractionDiffKind =
	| "add"
	| "modify"
	| "remove"
	| "unchanged"
	| null;

export interface ExtractionCandidate {
	id: string;
	extraction_run_id: string;
	candidate_type: ExtractionCandidateType;
	status: ExtractionCandidateStatus;
	diff_kind: ExtractionDiffKind;
	payload: unknown;
	created_at: string;
	updated_at: string;
}

export interface ExtractionRunDetail extends ExtractionRunListItem {
	research_note_slug: string;
	research_note_title: string;
	candidates: ExtractionCandidate[];
}

export interface GraphRevisionItem {
	id: string;
	entity_type: string;
	entity_id: string | null;
	action: "create" | "update" | "deactivate" | "delete";
	research_note_title: string | null;
	research_note_slug: string | null;
	extraction_run_id: string | null;
	extraction_run_source: string | null;
	detail: unknown;
	created_at: string;
}
