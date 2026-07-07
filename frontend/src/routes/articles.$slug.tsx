import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isNotFoundError } from "../lib/api";
import { formatDate } from "../lib/format";
import { articleQueryOptions } from "../lib/queries";

export const Route = createFileRoute("/articles/$slug")({
	component: ArticleDetail,
});

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

function ArticleDetail() {
	const { slug } = Route.useParams();
	const { data, isPending, isError, error } = useQuery(
		articleQueryOptions(slug),
	);

	if (isPending) {
		return <p className="font-mono text-slate-400 text-sm">불러오는 중…</p>;
	}

	if (isError) {
		return (
			<div className="space-y-4">
				<BackLink />
				{isNotFoundError(error) ? (
					<p className="text-slate-900">글을 찾을 수 없습니다.</p>
				) : (
					<p className="text-red-700 text-sm">
						글을 불러오지 못했습니다.
						{error instanceof Error ? ` (${error.message})` : ""}
					</p>
				)}
			</div>
		);
	}

	return (
		<article className="space-y-6">
			<BackLink />
			{data.published_at && (
				<time className="block font-mono text-slate-400 text-xs">
					{formatDate(data.published_at)}
				</time>
			)}
			<div className="prose prose-slate max-w-none">
				<Markdown remarkPlugins={[remarkGfm]}>{data.body}</Markdown>
			</div>
		</article>
	);
}
