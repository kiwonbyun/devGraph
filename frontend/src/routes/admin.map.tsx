import dagre from "@dagrejs/dagre";
import type { IndustryMap } from "@devgraph/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Background,
	Controls,
	type Edge,
	MarkerType,
	MiniMap,
	type Node,
	ReactFlow,
	useNodesState,
} from "@xyflow/react";
import { useState } from "react";
import { api } from "../lib/api";
import { nodeFill, nodeStroke } from "../lib/industryLabels";
import { industryMapQueryOptions } from "../lib/queries";

const W = 172;
const H = 66;

export function AdminMap() {
	const map = useQuery(industryMapQueryOptions);
	if (map.isPending) {
		return <p className="font-mono text-slate-400 text-sm">불러오는 중…</p>;
	}
	if (map.isError) {
		return <p className="text-red-700 text-sm">지도를 불러오지 못했습니다.</p>;
	}
	if (map.data.nodes.length === 0) {
		return <p className="text-slate-400 text-sm">아직 노드가 없습니다.</p>;
	}
	return <AdminMapEditor map={map.data} />;
}

function layout(map: IndustryMap): { nodes: Node[]; edges: Edge[] } {
	const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
	g.setGraph({
		rankdir: "TB",
		nodesep: 56,
		ranksep: 82,
		marginx: 28,
		marginy: 28,
	});
	for (const n of map.nodes) g.setNode(n.id, { width: W, height: H });
	for (const e of map.edges) g.setEdge(e.source_node_id, e.target_node_id);
	dagre.layout(g);

	const nodes: Node[] = map.nodes.map((n) => {
		const laid = g.node(n.id) as { x: number; y: number };
		const position =
			n.pos_x != null && n.pos_y != null
				? { x: n.pos_x, y: n.pos_y }
				: { x: laid.x - W / 2, y: laid.y - H / 2 };
		return {
			id: n.id,
			position,
			data: { label: n.canonical_name },
			style: {
				width: W,
				height: H,
				borderRadius: 8,
				border: `1px solid ${nodeStroke(n.node_type)}`,
				background: nodeFill(n.node_type),
				fontSize: 12,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 6,
				textAlign: "center" as const,
			},
		};
	});
	const edges: Edge[] = map.edges.map((e) => ({
		id: e.id,
		source: e.source_node_id,
		target: e.target_node_id,
		type: "smoothstep",
		label: e.edge_type,
		markerEnd: { type: MarkerType.ArrowClosed },
		style: { stroke: "#94a3b8" },
		labelStyle: { fontSize: 10, fill: "#64748b" },
	}));
	return { nodes, edges };
}

function AdminMapEditor({ map }: { map: IndustryMap }) {
	const queryClient = useQueryClient();
	const initial = layout(map);
	const [nodes, , onNodesChange] = useNodesState(initial.nodes);
	const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

	async function save() {
		setStatus("saving");
		try {
			const positions = nodes.map((n) => ({
				id: n.id,
				x: Math.round(n.position.x),
				y: Math.round(n.position.y),
			}));
			await api.post("/admin/industry-nodes/positions", { positions });
			await queryClient.invalidateQueries({ queryKey: ["industry-map"] });
			setStatus("saved");
		} catch {
			setStatus("idle");
		}
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-semibold text-slate-950 text-xl">지도 편집</h1>
					<p className="mt-1 text-slate-500 text-sm">
						노드를 드래그해 배치한 뒤 저장하면 공개 지도에 반영됩니다.
					</p>
				</div>
				<div className="flex items-center gap-3">
					{status === "saved" ? (
						<span className="font-mono text-emerald-600 text-xs">저장됨</span>
					) : null}
					<button
						type="button"
						disabled={status === "saving"}
						onClick={save}
						className="rounded bg-slate-950 px-4 py-2 font-medium text-sm text-white transition hover:bg-slate-800 disabled:bg-slate-300"
					>
						{status === "saving" ? "저장 중" : "위치 저장"}
					</button>
				</div>
			</div>
			<div className="h-[calc(100vh-180px)] overflow-hidden rounded border border-slate-200 bg-white">
				<ReactFlow
					nodes={nodes}
					edges={initial.edges}
					onNodesChange={(changes) => {
						onNodesChange(changes);
						if (status === "saved") setStatus("idle");
					}}
					fitView
					fitViewOptions={{ padding: 0.12 }}
					minZoom={0.2}
					maxZoom={1.6}
					nodesConnectable={false}
					proOptions={{ hideAttribution: true }}
				>
					<Background color="#e2e8f0" gap={18} />
					<MiniMap pannable zoomable />
					<Controls showInteractive={false} />
				</ReactFlow>
			</div>
		</div>
	);
}
