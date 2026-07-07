import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDate } from "../lib/format";
import { articlesQueryOptions } from "../lib/queries";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const { data, isPending, isError, error } = useQuery(articlesQueryOptions);

	if (isPending) {
		return <p className="font-mono text-slate-400 text-sm">불러오는 중…</p>;
	}

	if (isError) {
		return (
			<p className="text-red-700 text-sm">
				글 목록을 불러오지 못했습니다.
				{error instanceof Error ? ` (${error.message})` : ""}
			</p>
		);
	}

	if (data.length === 0) {
		return <p className="text-slate-500 text-sm">아직 쓴 글이 없습니다.</p>;
	}

	return (
		<ul className="divide-y divide-slate-100">
			{data.map((article) => (
				<li key={article.slug}>
					<Link
						to="/articles/$slug"
						params={{ slug: article.slug }}
						className="group block py-5"
					>
						<h2 className="font-medium text-lg text-slate-900 transition-colors group-hover:text-indigo-600">
							{article.title}
						</h2>
						<time className="mt-1 block font-mono text-slate-400 text-xs">
							{formatDate(article.published_at)}
						</time>
					</Link>
				</li>
			))}
		</ul>
	);
}
