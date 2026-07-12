import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import { config, hasOpenaiKey } from "../config";
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

// 추출 프롬프트/스키마를 바꿀 때 올린다. 실행 메타데이터로 보존된다.
export const PROMPT_VERSION = "2026-07-12.1";

export class LlmNotConfiguredError extends Error {
	constructor(message: string) {
		super(message);
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

function buildUserPrompt(input: {
	title: string;
	evidence: EvidenceInput[];
}): string {
	const numbered = input.evidence
		.map((item) => `[${item.ordinal}] ${item.text}`)
		.join("\n\n");
	return `리서치 글 제목: ${input.title}

아래는 문단 번호가 붙은 근거 문단들이다. 각 후보의 evidence_ordinal(s) 는 반드시 이 번호들 중에서 고른다.

${numbered}`;
}

export async function extractGraphCandidates(input: {
	title: string;
	evidence: EvidenceInput[];
}): Promise<LlmExtraction> {
	if (config.llmProvider === "openai") {
		return extractViaOpenAI(input);
	}
	return extractViaCodex(input);
}

// --- Codex CLI 경로: 로컬 Codex 를 ChatGPT 로그인으로 사용 (API 키 불필요) ---
async function extractViaCodex(input: {
	title: string;
	evidence: EvidenceInput[];
}): Promise<LlmExtraction> {
	const prompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(input)}\n\n주어진 JSON 스키마에 정확히 맞는 JSON 하나만 출력하라.`;

	const dir = mkdtempSync(join(tmpdir(), "devgraph-codex-"));
	const schemaPath = join(dir, "schema.json");
	const outPath = join(dir, `out-${randomUUID()}.txt`);
	writeFileSync(schemaPath, JSON.stringify(CANDIDATE_SCHEMA));

	try {
		const args = [
			"exec",
			"--skip-git-repo-check",
			"--sandbox",
			"read-only",
			"--output-schema",
			schemaPath,
			"--output-last-message",
			outPath,
		];
		if (config.codexModel) args.push("-m", config.codexModel);
		args.push(prompt);

		const { code, stderr } = await runCodex(args, dir);
		let text = "";
		try {
			text = readFileSync(outPath, "utf8").trim();
		} catch {
			text = "";
		}
		if (!text) {
			const hint = /not logged in|Please run .*login|auth/i.test(stderr)
				? " (codex 로그인 필요: `codex login`)"
				: "";
			throw new LlmNotConfiguredError(
				`Codex CLI 추출에 실패했습니다 (exit ${code})${hint}. ${stderr.slice(-400)}`,
			);
		}

		const parsed = parseJsonLoose(text);
		return {
			result: normalize(parsed),
			raw: parsed,
			model: config.codexModel || "codex(chatgpt)",
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function runCodex(
	args: string[],
	cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(config.codexBin, args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			timeout: 180_000,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("error", (err) => {
			reject(
				new LlmNotConfiguredError(
					`Codex CLI 실행 실패 (${config.codexBin}): ${err.message}. codex 설치/PATH 및 \`codex login\` 확인.`,
				),
			);
		});
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

// --- OpenAI API 경로: API 키 종량제 ---
async function extractViaOpenAI(input: {
	title: string;
	evidence: EvidenceInput[];
}): Promise<LlmExtraction> {
	if (!hasOpenaiKey()) {
		throw new LlmNotConfiguredError(
			"OPENAI_API_KEY 가 설정되지 않았습니다. backend/.env 에 키를 넣고 재시작하세요.",
		);
	}

	const client = new OpenAI({
		apiKey: config.openaiApiKey,
		...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
	});

	const response = await client.responses.create({
		model: config.openaiModel,
		input: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: buildUserPrompt(input) },
		],
		text: {
			format: {
				type: "json_schema",
				name: "industry_graph_extraction",
				strict: true,
				schema: CANDIDATE_SCHEMA,
			},
		},
	});

	const text = response.output_text;
	if (!text) throw new Error("LLM 응답이 비어 있습니다.");

	const parsed = parseJsonLoose(text);
	return {
		result: normalize(parsed),
		raw: parsed,
		model: response.model ?? config.openaiModel,
	};
}

function parseJsonLoose(text: string): Partial<ExtractionResult> {
	try {
		return JSON.parse(text) as Partial<ExtractionResult>;
	} catch {
		const start = text.indexOf("{");
		const end = text.lastIndexOf("}");
		if (start >= 0 && end > start) {
			return JSON.parse(
				text.slice(start, end + 1),
			) as Partial<ExtractionResult>;
		}
		throw new Error("LLM 응답을 JSON 으로 파싱하지 못했습니다.");
	}
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
