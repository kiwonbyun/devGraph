import dagre from "@dagrejs/dagre";
import type {
	Evidence,
	ExtractionCandidate,
	IndustryEdgeType,
	IndustryNodeSearchResult,
	IndustryNodeType,
} from "@devgraph/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
	Background,
	type Edge,
	MarkerType,
	type Node,
	Position,
	ReactFlow,
} from "@xyflow/react";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { nodeFill, nodeStroke } from "../lib/industryLabels";
import {
	adminEvidenceQueryOptions,
	extractionRunQueryOptions,
} from "../lib/queries";

// --- 후보 payload 타입 (백엔드 candidateTypes 와 대응) ---
interface NodePayload {
	key: string;
	name: string;
	node_type: IndustryNodeType;
	description: string;
	evidence_ordinals: number[];
	merge_into_node_id?: string | null;
}
interface EdgePayload {
	source_key: string;
	target_key: string;
	edge_type: IndustryEdgeType;
	description: string;
	evidence_ordinals: number[];
}
interface CompanyRolePayload {
	company_name: string;
	is_listed: boolean;
	ticker: string | null;
	node_key: string;
	role: string;
	evidence_ordinal: number;
}
interface RelationPayload {
	source_key: string;
	target_key: string;
	relation_type: "is_a" | "part_of";
}
interface AliasPayload {
	node_key: string;
	alias: string;
}
interface ClusterPayload {
	name: string;
	description: string;
	node_keys: string[];
}

const NODE_TYPES: IndustryNodeType[] = ["commodity", "process", "sector"];
const EDGE_TYPES: IndustryEdgeType[] = [
	"flows_to",
	"produces",
	"uses",
	"operates_at",
	"supplies_to",
	"derived_from",
];

export function ExtractionRunReview() {
	const { runId } = useParams({ from: "/admin/extraction-runs/$runId" });
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isApproving, setIsApproving] = useState(false);
	const { data, isPending, isError } = useQuery(
		extractionRunQueryOptions(runId),
	);
	const { data: evidence } = useQuery(
		adminEvidenceQueryOptions(data?.research_note_slug ?? ""),
	);

	if (isPending) {
		return <p className="font-mono text-slate-400 text-sm">불러오는 중…</p>;
	}
	if (isError) {
		return (
			<p className="text-red-700 text-sm">추출 실행을 불러오지 못했습니다.</p>
		);
	}

	const isClosed = data.status !== "pending";
	const refetch = async () => {
		await queryClient.invalidateQueries({
			queryKey: ["admin", "extraction-runs", runId],
		});
	};

	const nodeOptions = data.candidates
		.filter((c) => c.candidate_type === "node" && c.status !== "rejected")
		.map((c) => {
			const p = c.payload as NodePayload;
			return { key: p.key, name: p.name };
		});

	async function approve() {
		setIsApproving(true);
		try {
			await api.post(
				`/admin/extraction-runs/${encodeURIComponent(runId)}/approve`,
			);
			await queryClient.invalidateQueries({ queryKey: ["industry-map"] });
			await navigate({ to: "/" });
		} finally {
			setIsApproving(false);
		}
	}

	async function addCandidate(candidateType: string, payload: unknown) {
		await api.post(
			`/admin/extraction-runs/${encodeURIComponent(runId)}/candidates`,
			{ candidate_type: candidateType, payload },
		);
		await refetch();
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<Link
						to="/admin/research-notes/$slug"
						params={{ slug: data.research_note_slug }}
						className="font-mono text-slate-400 text-xs transition-colors hover:text-indigo-600"
					>
						← {data.research_note_title}
					</Link>
					<h1 className="mt-2 font-semibold text-2xl text-slate-950">
						추출 후보 검수
					</h1>
					<p className="mt-1 font-mono text-slate-400 text-xs">
						run #{data.id} · {data.source} · {data.status}
					</p>
					{data.model || data.prompt_version || data.input_note_version ? (
						<p className="mt-0.5 font-mono text-[10px] text-slate-400">
							{data.model ? `model ${data.model}` : null}
							{data.prompt_version ? ` · prompt ${data.prompt_version}` : null}
							{data.input_note_version
								? ` · 입력 글 ${new Date(data.input_note_version).toLocaleString("ko-KR")}`
								: null}
						</p>
					) : null}
				</div>
				<button
					type="button"
					disabled={isClosed || isApproving}
					onClick={approve}
					className="rounded bg-slate-950 px-4 py-2 font-medium text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
				>
					{isApproving ? "승인 중" : "포함 후보 일괄 승인"}
				</button>
			</div>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.3fr)]">
				<EvidencePane evidence={evidence ?? []} />
				<CandidateGraphPane candidates={data.candidates} />
				<CandidateListPane
					candidates={data.candidates}
					isClosed={isClosed}
					nodeOptions={nodeOptions}
					onChanged={refetch}
					onAdd={addCandidate}
				/>
			</div>
		</div>
	);
}

function EvidencePane({ evidence }: { evidence: Evidence[] }) {
	return (
		<section className="rounded border border-slate-200 bg-white p-4">
			<h2 className="mb-3 font-semibold text-slate-950 text-sm">원문 근거</h2>
			<ol className="max-h-[70vh] space-y-3 overflow-y-auto">
				{evidence.map((item) => (
					<li
						key={item.id}
						className="border-slate-200 border-l-2 py-1 pl-3 text-slate-700 text-xs leading-5"
					>
						<span className="mb-1 block font-mono text-slate-400">
							#{item.ordinal}
						</span>
						{item.text}
					</li>
				))}
			</ol>
		</section>
	);
}

function CandidateGraphPane({
	candidates,
}: {
	candidates: ExtractionCandidate[];
}) {
	const { nodes, edges } = useMemo(
		() => buildCandidateGraph(candidates),
		[candidates],
	);
	return (
		<section className="rounded border border-slate-200 bg-white p-2">
			<div className="h-[70vh]">
				{nodes.length === 0 ? (
					<p className="p-4 text-slate-400 text-sm">노드 후보가 없습니다.</p>
				) : (
					<ReactFlow
						nodes={nodes}
						edges={edges}
						fitView
						fitViewOptions={{ padding: 0.15 }}
						nodesDraggable={false}
						nodesConnectable={false}
						proOptions={{ hideAttribution: true }}
						minZoom={0.2}
						maxZoom={1.5}
					>
						<Background color="#e2e8f0" gap={16} />
					</ReactFlow>
				)}
			</div>
		</section>
	);
}

function CandidateListPane({
	candidates,
	isClosed,
	nodeOptions,
	onChanged,
	onAdd,
}: {
	candidates: ExtractionCandidate[];
	isClosed: boolean;
	nodeOptions: { key: string; name: string }[];
	onChanged: () => Promise<void>;
	onAdd: (candidateType: string, payload: unknown) => Promise<void>;
}) {
	const byType = (t: string) =>
		candidates.filter((c) => c.candidate_type === t);

	return (
		<section className="max-h-[74vh] space-y-5 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3">
			<CandidateGroup
				title="노드"
				items={byType("node")}
				isClosed={isClosed}
				onAdd={() =>
					onAdd("node", {
						key: `manual-${Date.now()}`,
						name: "새 노드",
						node_type: "commodity",
						description: "",
						evidence_ordinals: [],
					})
				}
				render={(c) =>
					c.diff_kind === "remove" ? (
						<RemovalCard
							key={c.id}
							candidate={c}
							isClosed={isClosed}
							onChanged={onChanged}
						/>
					) : (
						<NodeCard
							key={c.id}
							candidate={c}
							isClosed={isClosed}
							onChanged={onChanged}
						/>
					)
				}
			/>
			<CandidateGroup
				title="엣지"
				items={byType("edge")}
				isClosed={isClosed}
				onAdd={() =>
					onAdd("edge", {
						source_key: nodeOptions[0]?.key ?? "",
						target_key: nodeOptions[1]?.key ?? nodeOptions[0]?.key ?? "",
						edge_type: "flows_to",
						description: "",
						evidence_ordinals: [],
					})
				}
				render={(c) =>
					c.diff_kind === "remove" ? (
						<RemovalCard
							key={c.id}
							candidate={c}
							isClosed={isClosed}
							onChanged={onChanged}
						/>
					) : (
						<EdgeCard
							key={c.id}
							candidate={c}
							isClosed={isClosed}
							nodeOptions={nodeOptions}
							onChanged={onChanged}
						/>
					)
				}
			/>
			<CandidateGroup
				title="기업 역할"
				items={byType("company_role")}
				isClosed={isClosed}
				onAdd={() =>
					onAdd("company_role", {
						company_name: "새 기업",
						is_listed: false,
						ticker: null,
						node_key: nodeOptions[0]?.key ?? "",
						role: "",
						evidence_ordinal: 1,
					})
				}
				render={(c) =>
					c.diff_kind === "remove" ? (
						<RemovalCard
							key={c.id}
							candidate={c}
							isClosed={isClosed}
							onChanged={onChanged}
						/>
					) : (
						<CompanyCard
							key={c.id}
							candidate={c}
							isClosed={isClosed}
							nodeOptions={nodeOptions}
							onChanged={onChanged}
						/>
					)
				}
			/>
			<CandidateGroup
				title="계층 관계"
				items={byType("node_relation")}
				isClosed={isClosed}
				onAdd={() =>
					onAdd("node_relation", {
						source_key: nodeOptions[0]?.key ?? "",
						target_key: nodeOptions[1]?.key ?? nodeOptions[0]?.key ?? "",
						relation_type: "part_of",
					})
				}
				render={(c) => (
					<RelationCard
						key={c.id}
						candidate={c}
						isClosed={isClosed}
						nodeOptions={nodeOptions}
						onChanged={onChanged}
					/>
				)}
			/>
			<CandidateGroup
				title="별칭"
				items={byType("alias")}
				isClosed={isClosed}
				onAdd={() =>
					onAdd("alias", { node_key: nodeOptions[0]?.key ?? "", alias: "" })
				}
				render={(c) => (
					<AliasCard
						key={c.id}
						candidate={c}
						isClosed={isClosed}
						nodeOptions={nodeOptions}
						onChanged={onChanged}
					/>
				)}
			/>
			<CandidateGroup
				title="클러스터"
				items={byType("cluster")}
				isClosed={isClosed}
				onAdd={() =>
					onAdd("cluster", {
						name: "새 클러스터",
						description: "",
						node_keys: nodeOptions.map((n) => n.key),
					})
				}
				render={(c) => (
					<ClusterCard
						key={c.id}
						candidate={c}
						isClosed={isClosed}
						onChanged={onChanged}
					/>
				)}
			/>
		</section>
	);
}

function CandidateGroup({
	title,
	items,
	isClosed,
	onAdd,
	render,
}: {
	title: string;
	items: ExtractionCandidate[];
	isClosed: boolean;
	onAdd: () => void;
	render: (c: ExtractionCandidate) => React.ReactNode;
}) {
	return (
		<div>
			<div className="mb-2 flex items-center justify-between">
				<h3 className="font-semibold text-slate-950 text-xs">
					{title}{" "}
					<span className="font-mono text-slate-400">{items.length}</span>
				</h3>
				{!isClosed ? (
					<button
						type="button"
						onClick={onAdd}
						className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-slate-500 text-xs transition hover:bg-slate-50"
					>
						+ 추가
					</button>
				) : null}
			</div>
			<div className="space-y-2">{items.map(render)}</div>
		</div>
	);
}

// --- 카드 공통 훅 ---
function useCandidateCard<T>(candidate: ExtractionCandidate) {
	const [draft, setDraft] = useState<T>(candidate.payload as T);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isRejected = candidate.status === "rejected";

	async function save() {
		setSaving(true);
		setError(null);
		try {
			await api.patch(
				`/admin/extraction-candidates/${encodeURIComponent(candidate.id)}`,
				{ payload: draft },
			);
		} catch {
			setError("저장하지 못했습니다.");
		} finally {
			setSaving(false);
		}
	}

	async function toggle() {
		setSaving(true);
		setError(null);
		try {
			await api.post(
				`/admin/extraction-candidates/${encodeURIComponent(candidate.id)}/${
					isRejected ? "approve" : "reject"
				}`,
			);
		} catch {
			setError("상태를 바꾸지 못했습니다.");
		} finally {
			setSaving(false);
		}
	}

	return { draft, setDraft, saving, error, isRejected, save, toggle };
}

function DiffChip({ kind }: { kind: string | null }) {
	if (!kind || kind === "unchanged") return null;
	const styles: Record<string, string> = {
		add: "bg-emerald-50 text-emerald-700",
		modify: "bg-amber-50 text-amber-700",
		remove: "bg-red-50 text-red-700",
	};
	const labels: Record<string, string> = {
		add: "추가",
		modify: "수정",
		remove: "삭제",
	};
	return (
		<span
			className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${styles[kind] ?? "bg-slate-100 text-slate-500"}`}
		>
			{labels[kind] ?? kind}
		</span>
	);
}

function CardShell({
	badge,
	diffKind,
	isRejected,
	isClosed,
	saving,
	error,
	onSave,
	onToggle,
	hideSave,
	children,
}: {
	badge: string;
	diffKind?: string | null;
	isRejected: boolean;
	isClosed: boolean;
	saving: boolean;
	error: string | null;
	onSave: () => Promise<void>;
	onToggle: () => Promise<void>;
	hideSave?: boolean;
	children: React.ReactNode;
}) {
	const disabled = isClosed || saving;
	return (
		<article
			className={`rounded border bg-white p-3 ${isRejected ? "border-slate-200 opacity-50" : "border-slate-200"}`}
		>
			<div className="mb-2 flex items-center justify-between">
				<span className="flex items-center gap-1.5">
					<span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-500 text-xs">
						{badge}
					</span>
					<DiffChip kind={diffKind ?? null} />
				</span>
				<div className="flex gap-1.5">
					<button
						type="button"
						disabled={disabled}
						onClick={onToggle}
						className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 text-xs transition hover:bg-slate-50 disabled:opacity-40"
					>
						{isRejected ? "포함" : "제외"}
					</button>
					{hideSave ? null : (
						<button
							type="button"
							disabled={disabled || isRejected}
							onClick={onSave}
							className="rounded bg-slate-950 px-2 py-0.5 text-white text-xs transition hover:bg-slate-800 disabled:opacity-40"
						>
							{saving ? "…" : "저장"}
						</button>
					)}
				</div>
			</div>
			<div className="space-y-2">{children}</div>
			{error ? <p className="mt-1 text-red-700 text-xs">{error}</p> : null}
		</article>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="block">
			<span className="mb-0.5 block font-mono text-[10px] text-slate-400">
				{label}
			</span>
			{children}
		</div>
	);
}

const inputCls =
	"w-full rounded border border-slate-200 px-2 py-1 text-slate-800 text-xs outline-none focus:border-slate-400";

function ordinalsToText(ordinals: number[]): string {
	return ordinals.join(", ");
}
function textToOrdinals(text: string): number[] {
	return text
		.split(",")
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isFinite(n) && n > 0);
}

function NodeCard({
	candidate,
	isClosed,
	onChanged,
}: {
	candidate: ExtractionCandidate;
	isClosed: boolean;
	onChanged: () => Promise<void>;
}) {
	const c = useCandidateCard<NodePayload>(candidate);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<IndustryNodeSearchResult[]>([]);

	async function search() {
		const { data } = await api.get<IndustryNodeSearchResult[]>(
			`/admin/industry-nodes/search?q=${encodeURIComponent(query)}`,
		);
		setResults(data);
	}

	return (
		<CardShell
			badge={`node · ${c.draft.key}`}
			diffKind={candidate.diff_kind}
			isRejected={c.isRejected}
			isClosed={isClosed}
			saving={c.saving}
			error={c.error}
			onSave={async () => {
				await c.save();
				await onChanged();
			}}
			onToggle={async () => {
				await c.toggle();
				await onChanged();
			}}
		>
			<Field label="이름">
				<input
					className={inputCls}
					value={c.draft.name}
					onChange={(e) => c.setDraft({ ...c.draft, name: e.target.value })}
				/>
			</Field>
			<Field label="타입">
				<select
					className={inputCls}
					value={c.draft.node_type}
					onChange={(e) =>
						c.setDraft({
							...c.draft,
							node_type: e.target.value as IndustryNodeType,
						})
					}
				>
					{NODE_TYPES.map((t) => (
						<option key={t} value={t}>
							{t}
						</option>
					))}
				</select>
			</Field>
			<Field label="설명">
				<textarea
					className={`${inputCls} h-12 resize-y`}
					value={c.draft.description}
					onChange={(e) =>
						c.setDraft({ ...c.draft, description: e.target.value })
					}
				/>
			</Field>
			<Field label="근거 문단 (쉼표)">
				<input
					className={inputCls}
					value={ordinalsToText(c.draft.evidence_ordinals)}
					onChange={(e) =>
						c.setDraft({
							...c.draft,
							evidence_ordinals: textToOrdinals(e.target.value),
						})
					}
				/>
			</Field>
			<div className="rounded bg-slate-50 p-2">
				{c.draft.merge_into_node_id ? (
					<div className="flex items-center justify-between text-xs">
						<span className="text-emerald-700">
							기존 노드 #{c.draft.merge_into_node_id} 와 병합
						</span>
						<button
							type="button"
							className="font-mono text-slate-400 hover:text-slate-700"
							onClick={() =>
								c.setDraft({ ...c.draft, merge_into_node_id: null })
							}
						>
							해제
						</button>
					</div>
				) : (
					<div className="flex gap-1">
						<input
							className={inputCls}
							placeholder="기존 노드 검색(병합)"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						<button
							type="button"
							className="rounded border border-slate-200 px-2 text-slate-500 text-xs hover:bg-slate-100"
							onClick={search}
						>
							검색
						</button>
					</div>
				)}
				{results.length > 0 && !c.draft.merge_into_node_id ? (
					<ul className="mt-1 space-y-0.5">
						{results.map((r) => (
							<li key={r.id}>
								<button
									type="button"
									className="text-indigo-600 text-xs hover:underline"
									onClick={() => {
										c.setDraft({ ...c.draft, merge_into_node_id: r.id });
										setResults([]);
									}}
								>
									{r.canonical_name} ({r.node_type})
								</button>
							</li>
						))}
					</ul>
				) : null}
			</div>
		</CardShell>
	);
}

function EdgeCard({
	candidate,
	isClosed,
	nodeOptions,
	onChanged,
}: {
	candidate: ExtractionCandidate;
	isClosed: boolean;
	nodeOptions: { key: string; name: string }[];
	onChanged: () => Promise<void>;
}) {
	const c = useCandidateCard<EdgePayload>(candidate);
	return (
		<CardShell
			badge="edge"
			diffKind={candidate.diff_kind}
			isRejected={c.isRejected}
			isClosed={isClosed}
			saving={c.saving}
			error={c.error}
			onSave={async () => {
				await c.save();
				await onChanged();
			}}
			onToggle={async () => {
				await c.toggle();
				await onChanged();
			}}
		>
			<Field label="source">
				<NodeKeySelect
					value={c.draft.source_key}
					options={nodeOptions}
					onChange={(v) => c.setDraft({ ...c.draft, source_key: v })}
				/>
			</Field>
			<Field label="target">
				<NodeKeySelect
					value={c.draft.target_key}
					options={nodeOptions}
					onChange={(v) => c.setDraft({ ...c.draft, target_key: v })}
				/>
			</Field>
			<button
				type="button"
				className="rounded border border-slate-200 px-2 py-0.5 font-mono text-[10px] text-slate-500 hover:bg-slate-50"
				onClick={() =>
					c.setDraft({
						...c.draft,
						source_key: c.draft.target_key,
						target_key: c.draft.source_key,
					})
				}
			>
				⇄ 방향 반전
			</button>
			<Field label="타입">
				<select
					className={inputCls}
					value={c.draft.edge_type}
					onChange={(e) =>
						c.setDraft({
							...c.draft,
							edge_type: e.target.value as IndustryEdgeType,
						})
					}
				>
					{EDGE_TYPES.map((t) => (
						<option key={t} value={t}>
							{t}
						</option>
					))}
				</select>
			</Field>
			<Field label="설명">
				<textarea
					className={`${inputCls} h-10 resize-y`}
					value={c.draft.description}
					onChange={(e) =>
						c.setDraft({ ...c.draft, description: e.target.value })
					}
				/>
			</Field>
			<Field label="근거 문단 (쉼표)">
				<input
					className={inputCls}
					value={ordinalsToText(c.draft.evidence_ordinals)}
					onChange={(e) =>
						c.setDraft({
							...c.draft,
							evidence_ordinals: textToOrdinals(e.target.value),
						})
					}
				/>
			</Field>
		</CardShell>
	);
}

function CompanyCard({
	candidate,
	isClosed,
	nodeOptions,
	onChanged,
}: {
	candidate: ExtractionCandidate;
	isClosed: boolean;
	nodeOptions: { key: string; name: string }[];
	onChanged: () => Promise<void>;
}) {
	const c = useCandidateCard<CompanyRolePayload>(candidate);
	return (
		<CardShell
			badge="company"
			diffKind={candidate.diff_kind}
			isRejected={c.isRejected}
			isClosed={isClosed}
			saving={c.saving}
			error={c.error}
			onSave={async () => {
				await c.save();
				await onChanged();
			}}
			onToggle={async () => {
				await c.toggle();
				await onChanged();
			}}
		>
			<Field label="기업명">
				<input
					className={inputCls}
					value={c.draft.company_name}
					onChange={(e) =>
						c.setDraft({ ...c.draft, company_name: e.target.value })
					}
				/>
			</Field>
			<div className="flex items-center gap-2">
				<label className="flex items-center gap-1 text-slate-600 text-xs">
					<input
						type="checkbox"
						checked={c.draft.is_listed}
						onChange={(e) =>
							c.setDraft({ ...c.draft, is_listed: e.target.checked })
						}
					/>
					상장
				</label>
				<input
					className={inputCls}
					placeholder="ticker"
					value={c.draft.ticker ?? ""}
					onChange={(e) =>
						c.setDraft({ ...c.draft, ticker: e.target.value || null })
					}
				/>
			</div>
			<Field label="노드">
				<NodeKeySelect
					value={c.draft.node_key}
					options={nodeOptions}
					onChange={(v) => c.setDraft({ ...c.draft, node_key: v })}
				/>
			</Field>
			<Field label="역할">
				<input
					className={inputCls}
					value={c.draft.role}
					onChange={(e) => c.setDraft({ ...c.draft, role: e.target.value })}
				/>
			</Field>
			<Field label="근거 문단">
				<input
					className={inputCls}
					value={String(c.draft.evidence_ordinal)}
					onChange={(e) =>
						c.setDraft({
							...c.draft,
							evidence_ordinal: Number(e.target.value) || 1,
						})
					}
				/>
			</Field>
		</CardShell>
	);
}

function RelationCard({
	candidate,
	isClosed,
	nodeOptions,
	onChanged,
}: {
	candidate: ExtractionCandidate;
	isClosed: boolean;
	nodeOptions: { key: string; name: string }[];
	onChanged: () => Promise<void>;
}) {
	const c = useCandidateCard<RelationPayload>(candidate);
	return (
		<CardShell
			badge="relation"
			diffKind={candidate.diff_kind}
			isRejected={c.isRejected}
			isClosed={isClosed}
			saving={c.saving}
			error={c.error}
			onSave={async () => {
				await c.save();
				await onChanged();
			}}
			onToggle={async () => {
				await c.toggle();
				await onChanged();
			}}
		>
			<Field label="source (하위)">
				<NodeKeySelect
					value={c.draft.source_key}
					options={nodeOptions}
					onChange={(v) => c.setDraft({ ...c.draft, source_key: v })}
				/>
			</Field>
			<Field label="target (상위)">
				<NodeKeySelect
					value={c.draft.target_key}
					options={nodeOptions}
					onChange={(v) => c.setDraft({ ...c.draft, target_key: v })}
				/>
			</Field>
			<Field label="관계">
				<select
					className={inputCls}
					value={c.draft.relation_type}
					onChange={(e) =>
						c.setDraft({
							...c.draft,
							relation_type: e.target.value as "is_a" | "part_of",
						})
					}
				>
					<option value="is_a">is_a</option>
					<option value="part_of">part_of</option>
				</select>
			</Field>
		</CardShell>
	);
}

function AliasCard({
	candidate,
	isClosed,
	nodeOptions,
	onChanged,
}: {
	candidate: ExtractionCandidate;
	isClosed: boolean;
	nodeOptions: { key: string; name: string }[];
	onChanged: () => Promise<void>;
}) {
	const c = useCandidateCard<AliasPayload>(candidate);
	return (
		<CardShell
			badge="alias"
			diffKind={candidate.diff_kind}
			isRejected={c.isRejected}
			isClosed={isClosed}
			saving={c.saving}
			error={c.error}
			onSave={async () => {
				await c.save();
				await onChanged();
			}}
			onToggle={async () => {
				await c.toggle();
				await onChanged();
			}}
		>
			<Field label="노드">
				<NodeKeySelect
					value={c.draft.node_key}
					options={nodeOptions}
					onChange={(v) => c.setDraft({ ...c.draft, node_key: v })}
				/>
			</Field>
			<Field label="별칭">
				<input
					className={inputCls}
					value={c.draft.alias}
					onChange={(e) => c.setDraft({ ...c.draft, alias: e.target.value })}
				/>
			</Field>
		</CardShell>
	);
}

function ClusterCard({
	candidate,
	isClosed,
	onChanged,
}: {
	candidate: ExtractionCandidate;
	isClosed: boolean;
	onChanged: () => Promise<void>;
}) {
	const c = useCandidateCard<ClusterPayload>(candidate);
	return (
		<CardShell
			badge="cluster"
			diffKind={candidate.diff_kind}
			isRejected={c.isRejected}
			isClosed={isClosed}
			saving={c.saving}
			error={c.error}
			onSave={async () => {
				await c.save();
				await onChanged();
			}}
			onToggle={async () => {
				await c.toggle();
				await onChanged();
			}}
		>
			<Field label="이름">
				<input
					className={inputCls}
					value={c.draft.name}
					onChange={(e) => c.setDraft({ ...c.draft, name: e.target.value })}
				/>
			</Field>
			<Field label="설명">
				<textarea
					className={`${inputCls} h-10 resize-y`}
					value={c.draft.description}
					onChange={(e) =>
						c.setDraft({ ...c.draft, description: e.target.value })
					}
				/>
			</Field>
			<p className="font-mono text-[10px] text-slate-400">
				노드 {c.draft.node_keys.length}개
			</p>
		</CardShell>
	);
}

function RemovalCard({
	candidate,
	isClosed,
	onChanged,
}: {
	candidate: ExtractionCandidate;
	isClosed: boolean;
	onChanged: () => Promise<void>;
}) {
	const c = useCandidateCard<Record<string, unknown>>(candidate);
	const p = candidate.payload as {
		name?: string;
		description?: string;
		company_name?: string;
		role?: string;
	};
	const summary =
		p.name ??
		p.description ??
		[p.company_name, p.role].filter(Boolean).join(" · ") ??
		"항목";
	return (
		<CardShell
			badge={`${candidate.candidate_type}`}
			diffKind="remove"
			isRejected={c.isRejected}
			isClosed={isClosed}
			saving={c.saving}
			error={c.error}
			hideSave
			onSave={async () => {}}
			onToggle={async () => {
				await c.toggle();
				await onChanged();
			}}
		>
			<p className="text-slate-700 text-xs">{summary}</p>
			<p className="text-[10px] text-slate-400">
				이 글의 근거 연결을 제거하고, 남은 근거가 없으면 지도에서
				비활성화합니다.
			</p>
		</CardShell>
	);
}

function NodeKeySelect({
	value,
	options,
	onChange,
}: {
	value: string;
	options: { key: string; name: string }[];
	onChange: (v: string) => void;
}) {
	const known = options.some((o) => o.key === value);
	return (
		<select
			className={inputCls}
			value={value}
			onChange={(e) => onChange(e.target.value)}
		>
			{!known ? <option value={value}>{value || "(선택)"}</option> : null}
			{options.map((o) => (
				<option key={o.key} value={o.key}>
					{o.name} ({o.key})
				</option>
			))}
		</select>
	);
}

// 후보 노드/엣지로 dagre 레이아웃 미리보기. 제외된 후보는 흐리게.
function buildCandidateGraph(candidates: ExtractionCandidate[]): {
	nodes: Node[];
	edges: Edge[];
} {
	const nodeCands = candidates.filter((c) => c.candidate_type === "node");
	const edgeCands = candidates.filter((c) => c.candidate_type === "edge");

	const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
	graph.setGraph({
		rankdir: "TB",
		nodesep: 40,
		ranksep: 60,
		marginx: 16,
		marginy: 16,
	});

	const W = 150;
	const H = 46;
	const keyToActive = new Map<string, boolean>();
	for (const c of nodeCands) {
		const p = c.payload as NodePayload;
		graph.setNode(p.key, { width: W, height: H });
		keyToActive.set(p.key, c.status !== "rejected");
	}
	for (const c of edgeCands) {
		const p = c.payload as EdgePayload;
		if (keyToActive.has(p.source_key) && keyToActive.has(p.target_key)) {
			graph.setEdge(p.source_key, p.target_key);
		}
	}
	dagre.layout(graph);

	const nodes: Node[] = nodeCands.map((c) => {
		const p = c.payload as NodePayload;
		const pos = graph.node(p.key) as { x: number; y: number };
		const active = c.status !== "rejected";
		return {
			id: p.key,
			position: { x: (pos?.x ?? 0) - W / 2, y: (pos?.y ?? 0) - H / 2 },
			data: { label: p.name },
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
			style: {
				width: W,
				height: H,
				fontSize: 11,
				borderRadius: 8,
				border: `1px solid ${nodeStroke(p.node_type)}`,
				background: nodeFill(p.node_type),
				opacity: active ? 1 : 0.3,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 4,
				textAlign: "center" as const,
			},
		};
	});

	const edges: Edge[] = edgeCands
		.filter((c) => {
			const p = c.payload as EdgePayload;
			return keyToActive.has(p.source_key) && keyToActive.has(p.target_key);
		})
		.map((c) => {
			const p = c.payload as EdgePayload;
			const active = c.status !== "rejected";
			return {
				id: c.id,
				source: p.source_key,
				target: p.target_key,
				type: "smoothstep",
				markerEnd: { type: MarkerType.ArrowClosed },
				style: { stroke: "#94a3b8", opacity: active ? 1 : 0.25 },
			};
		});

	return { nodes, edges };
}
