import type { GraphRevisionItem } from "@devgraph/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { adminGraphRevisionsQueryOptions } from "../lib/queries";

const ACTION_STYLE: Record<string, string> = {
	create: "bg-emerald-50 text-emerald-700",
	update: "bg-amber-50 text-amber-700",
	deactivate: "bg-red-50 text-red-700",
	delete: "bg-red-50 text-red-700",
};
const ACTION_LABEL: Record<string, string> = {
	create: "생성",
	update: "수정",
	deactivate: "비활성화",
	delete: "삭제",
};
const ENTITY_LABEL: Record<string, string> = {
	node: "노드",
	edge: "엣지",
	company_role: "기업 역할",
	node_relation: "계층 관계",
	alias: "별칭",
	cluster: "클러스터",
};

export function AuditLog() {
	const revisions = useQuery(adminGraphRevisionsQueryOptions);

	return (
		<div className="space-y-4">
			<div>
				<h1 className="font-semibold text-slate-950 text-xl">감사 로그</h1>
				<p className="mt-1 text-slate-500 text-sm">
					승인·재추출 diff로 그래프가 어떻게 바뀌었는지 기록입니다. 최신순 최대
					100건.
				</p>
			</div>

			{revisions.isPending ? (
				<p className="font-mono text-slate-400 text-sm">불러오는 중…</p>
			) : revisions.isError ? (
				<p className="text-red-700 text-sm">감사 로그를 불러오지 못했습니다.</p>
			) : revisions.data.length === 0 ? (
				<p className="text-slate-400 text-sm">아직 기록이 없습니다.</p>
			) : (
				<div className="overflow-x-auto rounded border border-slate-200 bg-white">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-slate-100 border-b text-left text-slate-400 text-xs">
								<th className="px-4 py-2 font-medium">시각</th>
								<th className="px-4 py-2 font-medium">액션</th>
								<th className="px-4 py-2 font-medium">엔티티</th>
								<th className="px-4 py-2 font-medium">대상</th>
								<th className="px-4 py-2 font-medium">원인</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-50">
							{revisions.data.map((rev) => (
								<AuditRow key={rev.id} rev={rev} />
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function AuditRow({ rev }: { rev: GraphRevisionItem }) {
	const detail = rev.detail as {
		name?: string;
		description?: string;
		role?: string;
		company_name?: string;
		alias?: string;
		relation_type?: string;
		edge_type?: string;
	} | null;
	const target =
		detail?.name ??
		detail?.company_name ??
		detail?.alias ??
		detail?.description ??
		detail?.edge_type ??
		detail?.relation_type ??
		(rev.entity_id ? `#${rev.entity_id}` : "-");

	return (
		<tr className="text-slate-700">
			<td className="whitespace-nowrap px-4 py-2 font-mono text-slate-400 text-xs">
				{new Date(rev.created_at).toLocaleString("ko-KR")}
			</td>
			<td className="px-4 py-2">
				<span
					className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
						ACTION_STYLE[rev.action] ?? "bg-slate-100 text-slate-500"
					}`}
				>
					{ACTION_LABEL[rev.action] ?? rev.action}
				</span>
			</td>
			<td className="px-4 py-2 text-slate-500 text-xs">
				{ENTITY_LABEL[rev.entity_type] ?? rev.entity_type}
			</td>
			<td className="px-4 py-2">
				{detail?.company_name && detail?.role
					? `${detail.company_name} · ${detail.role}`
					: target}
			</td>
			<td className="px-4 py-2 text-xs">
				{rev.research_note_slug && rev.research_note_title ? (
					<Link
						to="/admin/research-notes/$slug"
						params={{ slug: rev.research_note_slug }}
						className="text-indigo-600 hover:text-indigo-700"
					>
						{rev.research_note_title}
					</Link>
				) : (
					<span className="text-slate-400">
						{rev.extraction_run_source
							? `추출 #${rev.extraction_run_id} (${rev.extraction_run_source})`
							: "글 삭제됨"}
					</span>
				)}
			</td>
		</tr>
	);
}
