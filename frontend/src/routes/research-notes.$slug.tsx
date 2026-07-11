import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isNotFoundError } from "../lib/api";
import { evidenceQueryOptions, researchNoteQueryOptions } from "../lib/queries";

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

export function ResearchNoteDetail() {
	const { slug } = useParams({ from: "/research-notes/$slug" });
	const { data, isPending, isError, error } = useQuery(
		researchNoteQueryOptions(slug),
	);
	const { data: evidence } = useQuery(evidenceQueryOptions(slug));

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
		<div className="mx-auto max-w-3xl space-y-10">
			<article className="space-y-6">
				<BackLink />
				<h1 className="font-semibold text-2xl text-slate-950">{data.title}</h1>
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
