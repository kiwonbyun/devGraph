import type {
	IndustryEdgeType,
	IndustryNodeType,
	NodeRelationType,
} from "@devgraph/shared";

export type CandidateType =
	| "node"
	| "edge"
	| "company_role"
	| "node_relation"
	| "cluster"
	| "alias";

export interface NodeCandidatePayload {
	key: string;
	name: string;
	node_type: IndustryNodeType;
	description: string;
	evidence_ordinals: number[];
	// 기존 승인 노드와 병합할 경우 그 id (검수 화면에서 지정).
	merge_into_node_id?: string | null;
}

export interface EdgeCandidatePayload {
	source_key: string;
	target_key: string;
	edge_type: IndustryEdgeType;
	description: string;
	evidence_ordinals: number[];
}

export interface CompanyRoleCandidatePayload {
	company_name: string;
	is_listed: boolean;
	ticker: string | null;
	node_key: string;
	role: string;
	evidence_ordinal: number;
}

// 계층 관계: same_as 는 쓰지 않고 is_a / part_of 만 사용 (GOAL.md).
export interface NodeRelationCandidatePayload {
	source_key: string;
	target_key: string;
	relation_type: Extract<NodeRelationType, "is_a" | "part_of">;
}

export interface AliasCandidatePayload {
	node_key: string;
	alias: string;
}

export interface ClusterCandidatePayload {
	name: string;
	description: string;
	node_keys: string[];
}
