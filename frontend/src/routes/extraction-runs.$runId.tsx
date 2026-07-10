import type { ExtractionCandidate } from "@devgraph/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../lib/api";
import { extractionRunQueryOptions } from "../lib/queries";

export function ExtractionRunReview() {
	const { runId } = useParams({ from: "/extraction-runs/$runId" });
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isApproving, setIsApproving] = useState(false);
	const { data, isPending, isError } = useQuery(
		extractionRunQueryOptions(runId),
	);

	if (isPending) {
		return <p className="font-mono text-slate-400 text-sm">불러오는 중…</p>;
	}

	if (isError) {
		return (
			<p className="text-red-700 text-sm">추출 실행을 불러오지 못했습니다.</p>
		);
	}

	const nodeCandidates = data.candidates.filter(
		(candidate) => candidate.candidate_type === "node",
	);
	const edgeCandidates = data.candidates.filter(
		(candidate) => candidate.candidate_type === "edge",
	);
	const companyCandidates = data.candidates.filter(
		(candidate) => candidate.candidate_type === "company_role",
	);

	return (
		<div className="mx-auto max-w-5xl space-y-8">
			<Link
				to="/research-notes/$slug"
				params={{ slug: data.research_note_slug }}
				className="font-mono text-slate-400 text-xs transition-colors hover:text-indigo-600"
			>
				← {data.research_note_title}
			</Link>
			<header className="flex items-start justify-between gap-4">
				<div>
					<p className="font-mono text-slate-400 text-xs">
						extraction run #{data.id} · {data.status}
					</p>
					<h1 className="mt-2 font-semibold text-3xl text-slate-950">
						추출 후보 검수
					</h1>
				</div>
				<button
					type="button"
					disabled={data.status === "approved" || isApproving}
					onClick={async () => {
						setIsApproving(true);
						try {
							await api.post(
								`/extraction-runs/${encodeURIComponent(runId)}/approve`,
							);
							await queryClient.invalidateQueries({
								queryKey: ["industry-map"],
							});
							await navigate({ to: "/" });
						} finally {
							setIsApproving(false);
						}
					}}
					className="rounded bg-slate-950 px-4 py-2 font-medium text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
				>
					{isApproving ? "승인 중" : "일괄 승인"}
				</button>
			</header>

			<CandidateSection title="노드 후보" candidates={nodeCandidates} />
			<CandidateSection title="엣지 후보" candidates={edgeCandidates} />
			<CandidateSection title="기업 역할 후보" candidates={companyCandidates} />
		</div>
	);
}

function CandidateSection({
	title,
	candidates,
}: {
	title: string;
	candidates: ExtractionCandidate[];
}) {
	return (
		<section>
			<h2 className="mb-3 font-semibold text-slate-950">
				{title}{" "}
				<span className="font-mono text-slate-400 text-xs">
					{candidates.length}
				</span>
			</h2>
			<div className="grid gap-3 md:grid-cols-2">
				{candidates.map((candidate) => (
					<article
						key={candidate.id}
						className="rounded border border-slate-200 bg-white p-4"
					>
						<div className="mb-2 flex items-center justify-between gap-3">
							<span className="font-mono text-slate-400 text-xs">
								#{candidate.id} {candidate.status}
							</span>
							<span className="rounded bg-slate-100 px-2 py-1 font-mono text-slate-500 text-xs">
								{candidate.candidate_type}
							</span>
						</div>
						<pre className="max-h-44 overflow-auto whitespace-pre-wrap text-slate-700 text-xs leading-5">
							{JSON.stringify(candidate.payload, null, 2)}
						</pre>
					</article>
				))}
			</div>
		</section>
	);
}
