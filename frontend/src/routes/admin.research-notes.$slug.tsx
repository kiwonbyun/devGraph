import type { ResearchNote } from "@devgraph/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { NoteEditor } from "../components/NoteEditor";
import { api, isNotFoundError } from "../lib/api";
import {
	adminResearchNoteQueryOptions,
	extractionRunsQueryOptions,
} from "../lib/queries";

export function EditResearchNote() {
	const { slug } = useParams({ from: "/admin/research-notes/$slug" });
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data, isPending, isError, error } = useQuery(
		adminResearchNoteQueryOptions(slug),
	);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	if (isPending) {
		return <p className="font-mono text-slate-400 text-sm">불러오는 중…</p>;
	}
	if (isError) {
		return (
			<div className="space-y-4">
				<BackLink />
				<p className="text-slate-900">
					{isNotFoundError(error)
						? "리서치 글을 찾을 수 없습니다."
						: "불러오지 못했습니다."}
				</p>
			</div>
		);
	}

	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["admin", "research-notes"] }),
			queryClient.invalidateQueries({
				queryKey: ["admin", "research-notes", slug],
			}),
		]);
	};

	async function togglePublish(note: ResearchNote) {
		setBusy(true);
		try {
			await api.post(
				`/admin/research-notes/${encodeURIComponent(slug)}/${
					note.status === "published" ? "unpublish" : "publish"
				}`,
			);
			await invalidate();
		} finally {
			setBusy(false);
		}
	}

	async function remove() {
		if (!window.confirm("이 리서치 글을 삭제할까요?")) return;
		setBusy(true);
		try {
			await api.delete(`/admin/research-notes/${encodeURIComponent(slug)}`);
			await invalidate();
			await navigate({ to: "/admin" });
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<BackLink />
				<div className="flex items-center gap-3">
					<span
						className={`rounded px-2 py-0.5 font-mono text-xs ${
							data.status === "published"
								? "bg-emerald-50 text-emerald-700"
								: "bg-slate-100 text-slate-500"
						}`}
					>
						{data.status}
					</span>
					<button
						type="button"
						disabled={busy}
						onClick={() => togglePublish(data)}
						className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 text-xs transition hover:bg-slate-50 disabled:opacity-50"
					>
						{data.status === "published" ? "비공개로" : "공개로"}
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={remove}
						className="rounded border border-red-200 px-3 py-1.5 font-medium text-red-700 text-xs transition hover:bg-red-50 disabled:opacity-50"
					>
						삭제
					</button>
				</div>
			</div>

			<ExtractionPanel slug={slug} />

			<NoteEditor
				key={data.updated_at}
				initialTitle={data.title}
				initialBody={data.body}
				saving={saving}
				error={saveError}
				onSave={async ({ title, body }) => {
					setSaving(true);
					setSaveError(null);
					try {
						await api.put(`/admin/research-notes/${encodeURIComponent(slug)}`, {
							title,
							body,
						});
						await invalidate();
					} catch {
						setSaveError("저장하지 못했습니다.");
					} finally {
						setSaving(false);
					}
				}}
			/>
		</div>
	);
}

function BackLink() {
	return (
		<Link
			to="/admin"
			className="font-mono text-slate-400 text-xs transition-colors hover:text-indigo-600"
		>
			← 리서치 글
		</Link>
	);
}

function ExtractionPanel({ slug }: { slug: string }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const runs = useQuery(extractionRunsQueryOptions(slug));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function runExtraction(kind: "llm" | "sample") {
		setBusy(true);
		setError(null);
		try {
			const path =
				kind === "llm"
					? `/admin/research-notes/${encodeURIComponent(slug)}/extraction-runs`
					: `/admin/research-notes/${encodeURIComponent(slug)}/extraction-runs/sample`;
			const { data } = await api.post<{ id: string }>(path);
			await queryClient.invalidateQueries({
				queryKey: ["admin", "extraction-runs", "note", slug],
			});
			await navigate({
				to: "/admin/extraction-runs/$runId",
				params: { runId: data.id },
			});
		} catch (cause) {
			const message =
				(cause as { response?: { data?: { message?: string } } })?.response
					?.data?.message ?? "추출에 실패했습니다.";
			setError(message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="rounded border border-slate-200 bg-white p-4">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-slate-950 text-sm">AI 추출</h2>
				<div className="flex gap-2">
					<button
						type="button"
						disabled={busy}
						onClick={() => runExtraction("llm")}
						className="rounded bg-slate-950 px-3 py-1.5 font-medium text-white text-xs transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
					>
						{busy ? "추출 중" : "AI 추출 실행"}
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => runExtraction("sample")}
						className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-600 text-xs transition hover:bg-slate-50 disabled:opacity-50"
					>
						샘플(dev)
					</button>
				</div>
			</div>
			{error ? <p className="mt-2 text-red-700 text-xs">{error}</p> : null}
			{runs.data && runs.data.length > 0 ? (
				<ul className="mt-3 space-y-1">
					{runs.data.slice(0, 5).map((run) => (
						<li key={run.id}>
							<Link
								to="/admin/extraction-runs/$runId"
								params={{ runId: run.id }}
								className="font-mono text-indigo-600 text-xs hover:text-indigo-700"
							>
								#{run.id} · {run.source} · {run.status}
							</Link>
						</li>
					))}
				</ul>
			) : (
				<p className="mt-2 text-slate-400 text-xs">
					아직 추출 실행이 없습니다.
				</p>
			)}
		</section>
	);
}
