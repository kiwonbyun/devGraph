import dagre from "@dagrejs/dagre";
import type { IndustryMap, IndustryNode } from "@devgraph/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
} from "@xyflow/react";
import { memo, useMemo, useState } from "react";
import { nodeFill, nodeStroke, nodeTypeLabel } from "../lib/industryLabels";
import { industryMapQueryOptions } from "../lib/queries";

export function Home() {
	const industryMap = useQuery(industryMapQueryOptions);

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

	return <IndustryMapChart map={industryMap.data} />;
}

function IndustryMapChart({ map }: { map: IndustryMap }) {
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const selectedNode =
		map.nodes.find((node) => node.id === selectedNodeId) ?? null;
	const { flowNodes, flowEdges } = useMemo(
		() => buildFlowGraph(map, selectedNode?.id ?? ""),
		[map, selectedNode?.id],
	);

	if (map.nodes.length === 0) {
		return (
			<div className="rounded border border-slate-200 p-6 text-slate-500 text-sm">
				아직 승인된 산업지도 노드가 없습니다.
			</div>
		);
	}

	return (
		<div className="relative h-[calc(100vh-96px)] overflow-hidden rounded border border-slate-200 bg-white">
			<ReactFlow
				nodes={flowNodes}
				edges={flowEdges}
				nodeTypes={nodeTypes}
				fitView
				fitViewOptions={{ padding: 0.12 }}
				minZoom={0.25}
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
			{selectedNode ? <NodeDrawer map={map} node={selectedNode} /> : null}
		</div>
	);
}

function NodeDrawer({ map, node }: { map: IndustryMap; node: IndustryNode }) {
	const companyRoles = map.company_roles.filter(
		(role) => role.industry_node_id === node.id,
	);
	const incomingCount = map.edges.filter(
		(edge) => edge.target_node_id === node.id,
	).length;
	const outgoingCount = map.edges.filter(
		(edge) => edge.source_node_id === node.id,
	).length;
	const evidenceCount = map.node_evidence.filter(
		(item) => item.industry_node_id === node.id,
	).length;

	return (
		<aside className="absolute top-4 right-4 z-10 w-[320px] rounded border border-slate-200 bg-white p-4 shadow-lg">
			<p className="font-mono text-slate-400 text-xs">
				{nodeTypeLabel(node.node_type)}
			</p>
			<h2 className="mt-1 font-semibold text-lg text-slate-950">
				{node.canonical_name}
			</h2>
			{node.description ? (
				<p className="mt-3 line-clamp-3 text-slate-600 text-sm leading-6">
					{node.description}
				</p>
			) : null}
			<div className="mt-4 grid grid-cols-3 gap-2 text-center">
				<DrawerMetric label="기업" value={companyRoles.length} />
				<DrawerMetric label="관계" value={incomingCount + outgoingCount} />
				<DrawerMetric label="근거" value={evidenceCount} />
			</div>
			{companyRoles.length > 0 ? (
				<div className="mt-4">
					<p className="mb-2 font-semibold text-slate-950 text-sm">관련 기업</p>
					<ul className="space-y-1">
						{companyRoles.slice(0, 4).map((role) => (
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

function DrawerMetric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded border border-slate-100 bg-slate-50 px-2 py-2">
			<div className="font-semibold text-slate-950 text-sm">{value}</div>
			<div className="mt-0.5 text-slate-400 text-xs">{label}</div>
		</div>
	);
}

type IndustryNodeFlowData = {
	node: IndustryNode;
};

type IndustryFlowNode = Node<IndustryNodeFlowData, "industryNode">;
type IndustryFlowEdge = Edge;

const NODE_WIDTH = 172;
const NODE_HEIGHT = 66;

const nodeTypes = {
	industryNode: memo(IndustryNodeCard),
};

function buildFlowGraph(
	map: IndustryMap,
	selectedNodeId: string,
): { flowNodes: IndustryFlowNode[]; flowEdges: IndustryFlowEdge[] } {
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

	const flowNodes: IndustryFlowNode[] = map.nodes.map((node) => {
		const position = graph.node(node.id) as { x: number; y: number };
		return {
			id: node.id,
			type: "industryNode",
			position: {
				x: position.x - NODE_WIDTH / 2,
				y: position.y - NODE_HEIGHT / 2,
			},
			data: { node },
			selected: node.id === selectedNodeId,
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
		};
	});

	const flowEdges: IndustryFlowEdge[] = map.edges.map((edge) => {
		const isSelected =
			edge.source_node_id === selectedNodeId ||
			edge.target_node_id === selectedNodeId;
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
			},
			labelStyle: {
				fill: isSelected ? "#0f172a" : "#64748b",
				fontSize: 11,
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			},
			labelBgStyle: {
				fill: "#ffffff",
				fillOpacity: 0.85,
			},
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
