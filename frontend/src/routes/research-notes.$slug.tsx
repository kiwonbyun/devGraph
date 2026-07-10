import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, isNotFoundError } from "../lib/api";
import {
	evidenceQueryOptions,
	extractionRunsQueryOptions,
	researchNoteQueryOptions,
} from "../lib/queries";

function BackLink() {
	return (
		<Link
			to="/"
			className="font-mono text-slate-400 text-xs transition-colors hover:text-indigo-600"
		>
			← 목록
		</Link>
	);
}

export function ResearchNoteDetail() {
	const { slug } = useParams({ from: "/research-notes/$slug" });
	const navigate = useNavigate();
	const [isCreatingRun, setIsCreatingRun] = useState(false);
	const { data, isPending, isError, error } = useQuery(
		researchNoteQueryOptions(slug),
	);
	const { data: evidence } = useQuery(evidenceQueryOptions(slug));
	const { data: extractionRuns } = useQuery(extractionRunsQueryOptions(slug));

	if (isPending) {
		return <p className="font-mono text-slate-400 text-sm">불러오는 중…</p>;
	}

	if (isError) {
		return (
			<div className="space-y-4">
				<BackLink />
				{isNotFoundError(error) ? (
					<p className="text-slate-900">리서치 글을 찾을 수 없습니다.</p>
				) : (
					<p className="text-red-700 text-sm">
						리서치 글을 불러오지 못했습니다.
						{error instanceof Error ? ` (${error.message})` : ""}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-10">
			<article className="space-y-6">
				<BackLink />
				<div className="flex items-start justify-between gap-4">
					<h1 className="font-semibold text-2xl text-slate-950">
						{data.title}
					</h1>
					<button
						type="button"
						disabled={isCreatingRun}
						onClick={async () => {
							setIsCreatingRun(true);
							try {
								const { data: run } = await api.post<{ id: string }>(
									`/research-notes/${encodeURIComponent(slug)}/extraction-runs/sample`,
								);
								await navigate({
									to: "/extraction-runs/$runId",
									params: { runId: run.id },
								});
							} finally {
								setIsCreatingRun(false);
							}
						}}
						className="rounded bg-slate-950 px-3 py-2 font-medium text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
					>
						{isCreatingRun ? "생성 중" : "추출 후보 생성"}
					</button>
				</div>
				{extractionRuns && extractionRuns.length > 0 ? (
					<div className="rounded border border-slate-200 bg-white p-3">
						<p className="mb-2 font-semibold text-slate-950 text-sm">
							추출 실행
						</p>
						<ul className="space-y-1">
							{extractionRuns.slice(0, 3).map((run) => (
								<li key={run.id}>
									<Link
										to="/extraction-runs/$runId"
										params={{ runId: run.id }}
										className="font-mono text-indigo-600 text-xs hover:text-indigo-700"
									>
										#{run.id} {run.status}
									</Link>
								</li>
							))}
						</ul>
					</div>
				) : null}
				<div className="prose prose-slate max-w-none">
					<Markdown remarkPlugins={[remarkGfm]}>{data.body}</Markdown>
				</div>
			</article>
			<section className="border-slate-100 border-t pt-6">
				<h2 className="font-semibold text-slate-950 text-sm">근거 문단</h2>
				<ol className="mt-4 space-y-3">
					{evidence?.map((item) => (
						<li
							key={item.id}
							className="border-slate-200 border-l-2 py-1 pl-3 text-slate-700 text-sm"
						>
							<span className="mb-1 block font-mono text-slate-400 text-xs">
								#{item.ordinal}
							</span>
							{item.text}
						</li>
					))}
				</ol>
			</section>
		</div>
	);
}
