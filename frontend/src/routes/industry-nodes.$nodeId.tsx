import type { IndustryMap, IndustryNode } from "@devgraph/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { nodeTypeLabel } from "../lib/industryLabels";
import { industryMapQueryOptions } from "../lib/queries";

export function IndustryNodeDetail() {
	const { nodeId } = useParams({ from: "/industry-nodes/$nodeId" });
	const industryMap = useQuery(industryMapQueryOptions);

	if (industryMap.isPending) {
		return <p className="font-mono text-slate-400 text-sm">불러오는 중…</p>;
	}

	if (industryMap.isError) {
		return (
			<p className="text-red-700 text-sm">노드 정보를 불러오지 못했습니다.</p>
		);
	}

	const node = industryMap.data.nodes.find((item) => item.id === nodeId);
	if (!node) {
		return (
			<div className="mx-auto max-w-3xl">
				<BackLink />
				<p className="mt-6 text-slate-900">노드를 찾을 수 없습니다.</p>
			</div>
		);
	}

	return <NodeDetailContent map={industryMap.data} node={node} />;
}

function NodeDetailContent({
	map,
	node,
}: {
	map: IndustryMap;
	node: IndustryNode;
}) {
	const incomingEdges = map.edges.filter(
		(edge) => edge.target_node_id === node.id,
	);
	const outgoingEdges = map.edges.filter(
		(edge) => edge.source_node_id === node.id,
	);
	const companyRoles = map.company_roles.filter(
		(role) => role.industry_node_id === node.id,
	);
	const evidence = map.node_evidence.filter(
		(item) => item.industry_node_id === node.id,
	);
	const nodeById = new Map(map.nodes.map((item) => [item.id, item]));

	return (
		<div className="mx-auto max-w-3xl">
			<BackLink />
			<header className="mt-6">
				<p className="font-mono text-slate-400 text-xs">
					{nodeTypeLabel(node.node_type)}
				</p>
				<h1 className="mt-2 font-semibold text-3xl text-slate-950">
					{node.canonical_name}
				</h1>
				{node.description ? (
					<p className="mt-4 text-slate-600 leading-7">{node.description}</p>
				) : null}
			</header>

			<DetailSection title="관련 기업">
				{companyRoles.length === 0 ? (
					<EmptyText>아직 연결된 기업이 없습니다.</EmptyText>
				) : (
					<ul className="space-y-3">
						{companyRoles.map((role) => (
							<li
								key={role.id}
								className="rounded border border-slate-200 bg-white p-4"
							>
								<div className="font-medium text-slate-950">
									{role.company_name}
									{role.ticker ? (
										<span className="ml-2 font-mono text-slate-400 text-xs">
											{role.ticker}
										</span>
									) : null}
								</div>
								<div className="mt-1 text-slate-500 text-sm">{role.role}</div>
							</li>
						))}
					</ul>
				)}
			</DetailSection>

			<DetailSection title="연결 관계">
				{incomingEdges.length === 0 && outgoingEdges.length === 0 ? (
					<EmptyText>아직 연결된 관계가 없습니다.</EmptyText>
				) : (
					<ul className="space-y-2">
						{incomingEdges.map((edge) => (
							<li key={edge.id} className="rounded bg-white px-4 py-3 text-sm">
								<span className="text-slate-500">들어옴: </span>
								<span className="font-medium text-slate-950">
									{nodeById.get(edge.source_node_id)?.canonical_name}
								</span>
								<span className="ml-2 font-mono text-slate-400 text-xs">
									{edge.edge_type}
								</span>
							</li>
						))}
						{outgoingEdges.map((edge) => (
							<li key={edge.id} className="rounded bg-white px-4 py-3 text-sm">
								<span className="text-slate-500">나감: </span>
								<span className="font-medium text-slate-950">
									{nodeById.get(edge.target_node_id)?.canonical_name}
								</span>
								<span className="ml-2 font-mono text-slate-400 text-xs">
									{edge.edge_type}
								</span>
							</li>
						))}
					</ul>
				)}
			</DetailSection>

			<DetailSection title="근거 문단">
				{evidence.length === 0 ? (
					<EmptyText>아직 연결된 근거 문단이 없습니다.</EmptyText>
				) : (
					<ol className="space-y-4">
						{evidence.map((item) => (
							<li
								key={item.evidence_id}
								className="rounded border border-slate-200 bg-white p-4"
							>
								<Link
									to="/research-notes/$slug"
									params={{ slug: item.research_note_slug }}
									className="font-mono text-indigo-600 text-xs hover:text-indigo-700"
								>
									{item.research_note_title} #{item.ordinal}
								</Link>
								<p className="mt-2 whitespace-pre-line text-slate-700 text-sm leading-6">
									{item.text}
								</p>
							</li>
						))}
					</ol>
				)}
			</DetailSection>
		</div>
	);
}

function BackLink() {
	return (
		<Link
			to="/"
			className="font-mono text-slate-400 text-xs transition-colors hover:text-indigo-600"
		>
			← 산업지도
		</Link>
	);
}

function DetailSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mt-8">
			<h2 className="mb-3 font-semibold text-slate-950">{title}</h2>
			{children}
		</section>
	);
}

function EmptyText({ children }: { children: React.ReactNode }) {
	return <p className="text-slate-400 text-sm">{children}</p>;
}
