import Anthropic from "@anthropic-ai/sdk";
import { config, hasAnthropicKey } from "../config";
import type {
	AliasCandidatePayload,
	ClusterCandidatePayload,
	CompanyRoleCandidatePayload,
	EdgeCandidatePayload,
	NodeCandidatePayload,
	NodeRelationCandidatePayload,
} from "./candidateTypes";

export interface EvidenceInput {
	ordinal: number;
	text: string;
}

export interface ExtractionResult {
	nodes: NodeCandidatePayload[];
	edges: EdgeCandidatePayload[];
	company_roles: CompanyRoleCandidatePayload[];
	node_relations: NodeRelationCandidatePayload[];
	aliases: AliasCandidatePayload[];
	clusters: ClusterCandidatePayload[];
}

export interface LlmExtraction {
	result: ExtractionResult;
	raw: unknown;
	model: string;
}

export class LlmNotConfiguredError extends Error {
	constructor() {
		super(
			"ANTHROPIC_API_KEY 가 설정되지 않았습니다. backend/.env 에 키를 넣고 재시작하세요.",
		);
		this.name = "LlmNotConfiguredError";
	}
}

const SYSTEM_PROMPT = `당신은 한국 산업 리서치 글을 "산업 밸류체인 지식 그래프" 초안으로 구조화하는 추출기다.

출력 원칙:
- 글에 실제로 등장하는 내용만 추출한다. 지어내지 않는다.
- 모든 노드/엣지/기업역할은 근거가 되는 문단 번호(evidence_ordinal)에 연결한다.
- node.key 는 영문 소문자 kebab-case 의 안정적 식별자다. edge/relation/alias/cluster/company_role 는 이 key 로 노드를 참조한다.

노드 타입(node_type):
- commodity: 원재료/상품 (예: 대두, 식물성 원유, 대두박, 튀김유, 닭)
- process: 공정/기능 (예: 착유, 정제, 배합사료 제조)
- sector: 사업자군/산업군 (예: 탱크터미널, 육계계열화업체, 치킨프랜차이즈)

엣지 타입(edge_type) — 방향 있음(source -> target):
- flows_to: 물리적/경제적 흐름
- produces: 공정이 산출물을 만든다
- uses: 공정/사업자군이 투입물을 사용한다
- operates_at: 사업자군이 공정/기능을 수행한다
- supplies_to: 사업자군이 다른 사업자군에 공급/판매한다
- derived_from: 어떤 상품이 다른 원료에서 유래한다

계층 관계(node_relations) — same_as 는 쓰지 않는다:
- is_a: 상하위 분류
- part_of: 구성 요소

기업 역할(company_roles): 기업은 그래프 노드가 아니라 특정 산업 노드에서의 역할로만 표현한다.
별칭(aliases): 같은 노드를 부르는 다른 표기.
클러스터(clusters): 이 글이 다루는 산업 영역(노드 집합). 보통 1개.`;

const CANDIDATE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: [
		"nodes",
		"edges",
		"company_roles",
		"node_relations",
		"aliases",
		"clusters",
	],
	properties: {
		nodes: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: [
					"key",
					"name",
					"node_type",
					"description",
					"evidence_ordinals",
				],
				properties: {
					key: { type: "string" },
					name: { type: "string" },
					node_type: {
						type: "string",
						enum: ["commodity", "process", "sector"],
					},
					description: { type: "string" },
					evidence_ordinals: { type: "array", items: { type: "integer" } },
				},
			},
		},
		edges: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: [
					"source_key",
					"target_key",
					"edge_type",
					"description",
					"evidence_ordinals",
				],
				properties: {
					source_key: { type: "string" },
					target_key: { type: "string" },
					edge_type: {
						type: "string",
						enum: [
							"flows_to",
							"produces",
							"uses",
							"operates_at",
							"supplies_to",
							"derived_from",
						],
					},
					description: { type: "string" },
					evidence_ordinals: { type: "array", items: { type: "integer" } },
				},
			},
		},
		company_roles: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: [
					"company_name",
					"is_listed",
					"ticker",
					"node_key",
					"role",
					"evidence_ordinal",
				],
				properties: {
					company_name: { type: "string" },
					is_listed: { type: "boolean" },
					ticker: { type: ["string", "null"] },
					node_key: { type: "string" },
					role: { type: "string" },
					evidence_ordinal: { type: "integer" },
				},
			},
		},
		node_relations: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["source_key", "target_key", "relation_type"],
				properties: {
					source_key: { type: "string" },
					target_key: { type: "string" },
					relation_type: { type: "string", enum: ["is_a", "part_of"] },
				},
			},
		},
		aliases: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["node_key", "alias"],
				properties: {
					node_key: { type: "string" },
					alias: { type: "string" },
				},
			},
		},
		clusters: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["name", "description", "node_keys"],
				properties: {
					name: { type: "string" },
					description: { type: "string" },
					node_keys: { type: "array", items: { type: "string" } },
				},
			},
		},
	},
} as const;

export async function extractGraphCandidates(input: {
	title: string;
	evidence: EvidenceInput[];
}): Promise<LlmExtraction> {
	if (!hasAnthropicKey()) {
		throw new LlmNotConfiguredError();
	}

	const client = new Anthropic({ apiKey: config.anthropicApiKey });
	const numbered = input.evidence
		.map((item) => `[${item.ordinal}] ${item.text}`)
		.join("\n\n");

	const userContent = `리서치 글 제목: ${input.title}

아래는 문단 번호가 붙은 근거 문단들이다. 각 후보의 evidence_ordinal(s) 는 반드시 이 번호들 중에서 고른다.

${numbered}`;

	const response = await client.messages.create({
		model: config.anthropicModel,
		max_tokens: 16000,
		system: SYSTEM_PROMPT,
		output_config: {
			format: { type: "json_schema", schema: CANDIDATE_SCHEMA },
		},
		messages: [{ role: "user", content: userContent }],
	});

	const textBlock = response.content.find((block) => block.type === "text");
	if (!textBlock || textBlock.type !== "text") {
		throw new Error("LLM 응답에 텍스트 블록이 없습니다.");
	}

	const parsed = JSON.parse(textBlock.text) as ExtractionResult;
	return {
		result: normalize(parsed),
		raw: parsed,
		model: response.model,
	};
}

function normalize(result: Partial<ExtractionResult>): ExtractionResult {
	return {
		nodes: result.nodes ?? [],
		edges: result.edges ?? [],
		company_roles: result.company_roles ?? [],
		node_relations: result.node_relations ?? [],
		aliases: result.aliases ?? [],
		clusters: result.clusters ?? [],
	};
}
