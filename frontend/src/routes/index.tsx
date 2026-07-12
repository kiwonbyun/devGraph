import dagre from "@dagrejs/dagre";
import type { IndustryMap, IndustryNode } from "@devgraph/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	Background,
	Controls,
	type Edge,
	Handle,
	MarkerType,
	MiniMap,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import { memo, useMemo, useState } from "react";
import { nodeFill, nodeStroke, nodeTypeLabel } from "../lib/industryLabels";
import {
	industryMapQueryOptions,
	researchNotesQueryOptions,
} from "../lib/queries";
import { useDocumentMeta } from "../lib/useDocumentMeta";

const NODE_TYPES: IndustryNode["node_type"][] = [
	"commodity",
	"process",
	"sector",
];
const EDGE_TYPES = [
	"flows_to",
	"produces",
	"uses",
	"operates_at",
	"supplies_to",
	"derived_from",
];

interface Filters {
	nodeTypes: Set<string>;
	edgeTypes: Set<string>;
	hasCompany: boolean;
	clusterId: string | null;
}

export function Home() {
	const industryMap = useQuery(industryMapQueryOptions);
	useDocumentMeta(
		"전체 산업지도",
		"관리자가 검수한 한국 산업 밸류체인을 근거 문단 단위로 구조화한 지식 그래프.",
	);

	if (industryMap.isPending) {
		return <p className="font-mono text-slate-400 text-sm">불러오는 중…</p>;
	}
	if (industryMap.isError) {
		const error = industryMap.error;
		return (
			<p className="text-red-700 text-sm">
				산업지도를 불러오지 못했습니다.
				{error instanceof Error ? ` (${error.message})` : ""}
			</p>
		);
	}
	if (industryMap.data.nodes.length === 0) {
		return (
			<div className="rounded border border-slate-200 p-6 text-slate-500 text-sm">
				아직 승인된 산업지도 노드가 없습니다.
			</div>
		);
	}

	return (
		<ReactFlowProvider>
			<IndustryMapExplorer map={industryMap.data} />
		</ReactFlowProvider>
	);
}

function IndustryMapExplorer({ map }: { map: IndustryMap }) {
	const flow = useReactFlow();
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [filters, setFilters] = useState<Filters>({
		nodeTypes: new Set(),
		edgeTypes: new Set(),
		hasCompany: false,
		clusterId: null,
	});

	const selectedNode =
		map.nodes.find((node) => node.id === selectedNodeId) ?? null;

	const matchedNodeIds = useMemo(
		() => computeMatchedNodes(map, filters),
		[map, filters],
	);

	const { flowNodes, flowEdges } = useMemo(
		() => buildFlowGraph(map, selectedNode?.id ?? "", matchedNodeIds, filters),
		[map, selectedNode?.id, matchedNodeIds, filters],
	);

	function focusNode(nodeId: string) {
		setSelectedNodeId(nodeId);
		flow.fitView({ nodes: [{ id: nodeId }], duration: 600, maxZoom: 1.4 });
	}

	return (
		<div className="relative h-[calc(100vh-96px)] overflow-hidden rounded border border-slate-200 bg-white">
			<Toolbar
				map={map}
				search={search}
				setSearch={setSearch}
				filters={filters}
				setFilters={setFilters}
				onPickNode={focusNode}
			/>
			<ReactFlow
				nodes={flowNodes}
				edges={flowEdges}
				nodeTypes={nodeTypes}
				fitView
				fitViewOptions={{ padding: 0.12 }}
				minZoom={0.2}
				maxZoom={1.6}
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable
				onNodeClick={(_, node) => setSelectedNodeId(node.id)}
				onPaneClick={() => setSelectedNodeId(null)}
				proOptions={{ hideAttribution: true }}
			>
				<Background color="#e2e8f0" gap={18} />
				<MiniMap
					pannable
					zoomable
					nodeColor={(node) =>
						nodeFill((node.data as IndustryNodeFlowData).node.node_type)
					}
				/>
				<Controls showInteractive={false} />
			</ReactFlow>
			{selectedNode ? (
				<NodeDetailPanel
					map={map}
					node={selectedNode}
					onClose={() => setSelectedNodeId(null)}
				/>
			) : null}
		</div>
	);
}

function Toolbar({
	map,
	search,
	setSearch,
	filters,
	setFilters,
	onPickNode,
}: {
	map: IndustryMap;
	search: string;
	setSearch: (v: string) => void;
	filters: Filters;
	setFilters: (updater: (prev: Filters) => Filters) => void;
	onPickNode: (nodeId: string) => void;
}) {
	const navigate = useNavigate();
	const { data: notes } = useQuery(researchNotesQueryOptions);
	const results = useMemo(
		() => searchResults(map, notes ?? [], search),
		[map, notes, search],
	);

	function toggle(set: Set<string>, value: string): Set<string> {
		const next = new Set(set);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		return next;
	}

	return (
		<div className="absolute top-3 left-3 z-20 w-[min(92vw,360px)] space-y-2">
			<div className="relative">
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="노드 · 기업 · 리서치 검색"
					className="w-full rounded border border-slate-300 bg-white/95 px-3 py-2 text-slate-800 text-sm shadow-sm outline-none backdrop-blur focus:border-slate-500"
				/>
				{search.trim() && results.length > 0 ? (
					<ul className="absolute z-30 mt-1 max-h-[50vh] w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
						{results.map((r) => (
							<li key={r.id}>
								<button
									type="button"
									className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50"
									onClick={() => {
										if (r.kind === "note") {
											navigate({
												to: "/research-notes/$slug",
												params: { slug: r.slug },
											});
										} else {
											onPickNode(r.nodeId);
											setSearch("");
										}
									}}
								>
									<span className="truncate text-slate-800">{r.label}</span>
									<span className="shrink-0 font-mono text-[10px] text-slate-400">
										{r.tag}
									</span>
								</button>
							</li>
						))}
					</ul>
				) : null}
			</div>

			<div className="flex flex-wrap gap-1.5 rounded border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
				{NODE_TYPES.map((t) => (
					<FilterChip
						key={t}
						active={filters.nodeTypes.has(t)}
						onClick={() =>
							setFilters((prev) => ({
								...prev,
								nodeTypes: toggle(prev.nodeTypes, t),
							}))
						}
					>
						{nodeTypeLabel(t)}
					</FilterChip>
				))}
				<FilterChip
					active={filters.hasCompany}
					onClick={() =>
						setFilters((prev) => ({ ...prev, hasCompany: !prev.hasCompany }))
					}
				>
					기업 있음
				</FilterChip>
				{map.clusters.length > 0 ? (
					<select
						value={filters.clusterId ?? ""}
						onChange={(e) =>
							setFilters((prev) => ({
								...prev,
								clusterId: e.target.value || null,
							}))
						}
						className="rounded border border-slate-200 px-2 py-1 text-slate-600 text-xs outline-none"
					>
						<option value="">클러스터 전체</option>
						{map.clusters.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</select>
				) : null}
			</div>

			<details className="rounded border border-slate-200 bg-white/95 p-2 text-xs shadow-sm backdrop-blur">
				<summary className="cursor-pointer text-slate-500">
					엣지 타입 필터
				</summary>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{EDGE_TYPES.map((t) => (
						<FilterChip
							key={t}
							active={filters.edgeTypes.has(t)}
							onClick={() =>
								setFilters((prev) => ({
									...prev,
									edgeTypes: toggle(prev.edgeTypes, t),
								}))
							}
						>
							{t}
						</FilterChip>
					))}
				</div>
			</details>
		</div>
	);
}

function FilterChip({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`rounded-full border px-2.5 py-1 font-mono text-xs transition ${
				active
					? "border-slate-900 bg-slate-900 text-white"
					: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
			}`}
		>
			{children}
		</button>
	);
}

function NodeDetailPanel({
	map,
	node,
	onClose,
}: {
	map: IndustryMap;
	node: IndustryNode;
	onClose: () => void;
}) {
	const companyRoles = map.company_roles.filter(
		(role) => role.industry_node_id === node.id,
	);
	const incoming = map.edges.filter((e) => e.target_node_id === node.id).length;
	const outgoing = map.edges.filter((e) => e.source_node_id === node.id).length;
	const nodeEvidence = map.node_evidence.filter(
		(item) => item.industry_node_id === node.id,
	);
	const evidenceCount = nodeEvidence.length;
	const sourceCount = new Set(
		nodeEvidence.map((item) => item.research_note_slug),
	).size;
	const aliases = map.aliases.filter((a) => a.node_id === node.id);

	return (
		<aside className="absolute inset-x-0 bottom-0 z-10 max-h-[70vh] overflow-y-auto rounded-t-xl border-slate-200 border-t bg-white p-4 shadow-lg md:inset-x-auto md:top-4 md:right-4 md:bottom-auto md:max-h-[calc(100%-2rem)] md:w-[320px] md:rounded-lg md:border">
			<div className="flex items-start justify-between">
				<p className="font-mono text-slate-400 text-xs">
					{nodeTypeLabel(node.node_type)}
				</p>
				<button
					type="button"
					onClick={onClose}
					className="font-mono text-slate-400 text-xs hover:text-slate-700"
				>
					닫기
				</button>
			</div>
			<h2 className="mt-1 font-semibold text-lg text-slate-950">
				{node.canonical_name}
			</h2>
			{aliases.length > 0 ? (
				<p className="mt-1 flex flex-wrap gap-1">
					{aliases.map((a) => (
						<span
							key={a.id}
							className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500"
						>
							{a.alias}
						</span>
					))}
				</p>
			) : null}
			{node.description ? (
				<p className="mt-3 line-clamp-4 text-slate-600 text-sm leading-6">
					{node.description}
				</p>
			) : null}
			<div className="mt-4 grid grid-cols-3 gap-2 text-center">
				<Metric label="기업" value={companyRoles.length} />
				<Metric label="관계" value={incoming + outgoing} />
				<Metric label="근거" value={evidenceCount} />
			</div>
			{sourceCount > 0 ? (
				<p className="mt-2 text-center font-mono text-[10px] text-slate-400">
					{sourceCount}개 리서치가 뒷받침
				</p>
			) : null}
			{companyRoles.length > 0 ? (
				<div className="mt-4">
					<p className="mb-2 font-semibold text-slate-950 text-sm">관련 기업</p>
					<ul className="space-y-1">
						{companyRoles.slice(0, 5).map((role) => (
							<li key={role.id} className="text-slate-600 text-sm">
								<span className="font-medium text-slate-900">
									{role.company_name}
								</span>{" "}
								{role.role}
							</li>
						))}
					</ul>
				</div>
			) : null}
			<Link
				to="/industry-nodes/$nodeId"
				params={{ nodeId: node.id }}
				className="mt-5 block rounded bg-slate-950 px-3 py-2 text-center font-medium text-sm text-white transition hover:bg-slate-800"
			>
				상세 보기
			</Link>
		</aside>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded border border-slate-100 bg-slate-50 px-2 py-2">
			<div className="font-semibold text-slate-950 text-sm">{value}</div>
			<div className="mt-0.5 text-slate-400 text-xs">{label}</div>
		</div>
	);
}

// --- 검색 ---
type SearchResult =
	| { kind: "node"; id: string; nodeId: string; label: string; tag: string }
	| { kind: "company"; id: string; nodeId: string; label: string; tag: string }
	| { kind: "note"; id: string; slug: string; label: string; tag: string };

function searchResults(
	map: IndustryMap,
	notes: { slug: string; title: string }[],
	query: string,
): SearchResult[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const results: SearchResult[] = [];
	const nodeById = new Map(map.nodes.map((n) => [n.id, n]));

	for (const node of map.nodes) {
		const aliasHit = map.aliases.some(
			(a) => a.node_id === node.id && a.alias.toLowerCase().includes(q),
		);
		if (
			node.canonical_name.toLowerCase().includes(q) ||
			(node.description ?? "").toLowerCase().includes(q) ||
			aliasHit
		) {
			results.push({
				kind: "node",
				id: `node-${node.id}`,
				nodeId: node.id,
				label: node.canonical_name,
				tag: "노드",
			});
		}
	}
	for (const role of map.company_roles) {
		if (
			role.company_name.toLowerCase().includes(q) ||
			role.role.toLowerCase().includes(q)
		) {
			const nodeName =
				nodeById.get(role.industry_node_id)?.canonical_name ?? "";
			results.push({
				kind: "company",
				id: `role-${role.id}`,
				nodeId: role.industry_node_id,
				label: `${role.company_name} · ${nodeName}`,
				tag: "기업",
			});
		}
	}
	for (const note of notes) {
		if (note.title.toLowerCase().includes(q)) {
			results.push({
				kind: "note",
				id: `note-${note.slug}`,
				slug: note.slug,
				label: note.title,
				tag: "리서치",
			});
		}
	}
	return results.slice(0, 12);
}

// --- 필터 매칭 ---
function computeMatchedNodes(map: IndustryMap, filters: Filters): Set<string> {
	const cluster = filters.clusterId
		? map.clusters.find((c) => c.id === filters.clusterId)
		: null;
	const clusterNodeIds = cluster ? new Set(cluster.node_ids) : null;
	const nodesWithCompany = new Set(
		map.company_roles.map((r) => r.industry_node_id),
	);

	const matched = new Set<string>();
	for (const node of map.nodes) {
		if (filters.nodeTypes.size > 0 && !filters.nodeTypes.has(node.node_type)) {
			continue;
		}
		if (filters.hasCompany && !nodesWithCompany.has(node.id)) continue;
		if (clusterNodeIds && !clusterNodeIds.has(node.id)) continue;
		matched.add(node.id);
	}
	return matched;
}

type IndustryNodeFlowData = { node: IndustryNode; dimmed: boolean };
type IndustryFlowNode = Node<IndustryNodeFlowData, "industryNode">;

const NODE_WIDTH = 172;
const NODE_HEIGHT = 66;
const nodeTypes = { industryNode: memo(IndustryNodeCard) };

function buildFlowGraph(
	map: IndustryMap,
	selectedNodeId: string,
	matchedNodeIds: Set<string>,
	filters: Filters,
): { flowNodes: IndustryFlowNode[]; flowEdges: Edge[] } {
	const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
	graph.setGraph({
		rankdir: "TB",
		nodesep: 56,
		ranksep: 82,
		marginx: 28,
		marginy: 28,
	});
	for (const node of map.nodes) {
		graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
	}
	for (const edge of map.edges) {
		graph.setEdge(edge.source_node_id, edge.target_node_id);
	}
	dagre.layout(graph);

	const filtersActive =
		filters.nodeTypes.size > 0 ||
		filters.hasCompany ||
		filters.clusterId !== null ||
		filters.edgeTypes.size > 0;

	const flowNodes: IndustryFlowNode[] = map.nodes.map((node) => {
		const laid = graph.node(node.id) as { x: number; y: number };
		const dimmed = filtersActive && !matchedNodeIds.has(node.id);
		// 관리자가 저장한 좌표가 있으면 그대로 쓰고, 없으면 자동 레이아웃.
		const position =
			node.pos_x != null && node.pos_y != null
				? { x: node.pos_x, y: node.pos_y }
				: { x: laid.x - NODE_WIDTH / 2, y: laid.y - NODE_HEIGHT / 2 };
		return {
			id: node.id,
			type: "industryNode",
			position,
			data: { node, dimmed },
			selected: node.id === selectedNodeId,
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
		};
	});

	const flowEdges: Edge[] = map.edges.map((edge) => {
		const isSelected =
			edge.source_node_id === selectedNodeId ||
			edge.target_node_id === selectedNodeId;
		const edgeTypeOk =
			filters.edgeTypes.size === 0 || filters.edgeTypes.has(edge.edge_type);
		const endpointsOk =
			matchedNodeIds.has(edge.source_node_id) &&
			matchedNodeIds.has(edge.target_node_id);
		const dimmed = filtersActive && !(edgeTypeOk && endpointsOk);
		return {
			id: edge.id,
			source: edge.source_node_id,
			target: edge.target_node_id,
			type: "smoothstep",
			label: edge.edge_type,
			markerEnd: { type: MarkerType.ArrowClosed },
			style: {
				stroke: isSelected ? "#0f172a" : "#94a3b8",
				strokeWidth: isSelected ? 2.4 : 1.4,
				opacity: dimmed ? 0.12 : 1,
			},
			labelStyle: {
				fill: isSelected ? "#0f172a" : "#64748b",
				fontSize: 11,
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				opacity: dimmed ? 0.15 : 1,
			},
			labelBgStyle: { fill: "#ffffff", fillOpacity: dimmed ? 0.3 : 0.85 },
			animated: isSelected,
		};
	});

	return { flowNodes, flowEdges };
}

function IndustryNodeCard({ data, selected }: NodeProps<IndustryFlowNode>) {
	const node = data.node;
	return (
		<div
			className="flex h-[66px] w-[172px] flex-col justify-center rounded-lg border px-3 shadow-sm transition"
			style={{
				backgroundColor: nodeFill(node.node_type),
				borderColor: selected ? "#0f172a" : nodeStroke(node.node_type),
				borderWidth: selected ? 2 : 1,
				opacity: data.dimmed ? 0.25 : 1,
			}}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="!h-2 !w-2 !border-slate-300 !bg-white"
			/>
			<div className="font-mono text-[10px] text-slate-500">
				{nodeTypeLabel(node.node_type)}
			</div>
			<div className="mt-1 truncate font-semibold text-[13px] text-slate-950">
				{node.canonical_name}
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!h-2 !w-2 !border-slate-300 !bg-white"
			/>
		</div>
	);
}
