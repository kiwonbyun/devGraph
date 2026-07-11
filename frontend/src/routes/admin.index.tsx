import type { ResearchNoteListItem } from "@devgraph/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { adminResearchNotesQueryOptions } from "../lib/queries";

export function AdminDashboard() {
	const notes = useQuery(adminResearchNotesQueryOptions);

	return (
		<div className="space-y-5">
			<div className="flex items-center justify-between">
				<h1 className="font-semibold text-slate-950 text-xl">리서치 글</h1>
				<Link
					to="/admin/research-notes/new"
					className="rounded bg-slate-950 px-3 py-2 font-medium text-sm text-white transition hover:bg-slate-800"
				>
					새 글
				</Link>
			</div>

			{notes.isPending ? (
				<p className="font-mono text-slate-400 text-sm">불러오는 중…</p>
			) : notes.isError ? (
				<p className="text-red-700 text-sm">목록을 불러오지 못했습니다.</p>
			) : notes.data.length === 0 ? (
				<p className="text-slate-400 text-sm">아직 리서치 글이 없습니다.</p>
			) : (
				<ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white">
					{notes.data.map((note) => (
						<NoteRow key={note.slug} note={note} />
					))}
				</ul>
			)}
		</div>
	);
}

function NoteRow({ note }: { note: ResearchNoteListItem }) {
	return (
		<li>
			<Link
				to="/admin/research-notes/$slug"
				params={{ slug: note.slug }}
				className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50"
			>
				<span className="font-medium text-slate-900 text-sm">{note.title}</span>
				<StatusBadge status={note.status} />
			</Link>
		</li>
	);
}

function StatusBadge({ status }: { status: ResearchNoteListItem["status"] }) {
	const published = status === "published";
	return (
		<span
			className={`rounded px-2 py-0.5 font-mono text-xs ${
				published
					? "bg-emerald-50 text-emerald-700"
					: "bg-slate-100 text-slate-500"
			}`}
		>
			{published ? "published" : "draft"}
		</span>
	);
}
