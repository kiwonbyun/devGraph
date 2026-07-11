import type { ExtractionCandidate } from "@devgraph/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
	const isClosed = data.status !== "pending";
	const refetchRun = async () => {
		await queryClient.invalidateQueries({
			queryKey: ["extraction-runs", runId],
		});
	};

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
					disabled={isClosed || isApproving}
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
					{isApproving ? "승인 중" : "포함 후보 일괄 승인"}
				</button>
			</header>

			<CandidateSection
				title="노드 후보"
				candidates={nodeCandidates}
				isClosed={isClosed}
				onChanged={refetchRun}
			/>
			<CandidateSection
				title="엣지 후보"
				candidates={edgeCandidates}
				isClosed={isClosed}
				onChanged={refetchRun}
			/>
			<CandidateSection
				title="기업 역할 후보"
				candidates={companyCandidates}
				isClosed={isClosed}
				onChanged={refetchRun}
			/>
		</div>
	);
}

function CandidateSection({
	title,
	candidates,
	isClosed,
	onChanged,
}: {
	title: string;
	candidates: ExtractionCandidate[];
	isClosed: boolean;
	onChanged: () => Promise<void>;
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
					<CandidateCard
						key={candidate.id}
						candidate={candidate}
						isClosed={isClosed}
						onChanged={onChanged}
					/>
				))}
			</div>
		</section>
	);
}

function CandidateCard({
	candidate,
	isClosed,
	onChanged,
}: {
	candidate: ExtractionCandidate;
	isClosed: boolean;
	onChanged: () => Promise<void>;
}) {
	const [draftPayload, setDraftPayload] = useState(
		JSON.stringify(candidate.payload, null, 2),
	);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isRejected = candidate.status === "rejected";
	const canEdit = !isClosed && candidate.status !== "approved";

	useEffect(() => {
		setDraftPayload(JSON.stringify(candidate.payload, null, 2));
	}, [candidate.payload]);

	async function savePayload() {
		setIsSaving(true);
		setError(null);
		try {
			const payload = JSON.parse(draftPayload);
			await api.patch(
				`/extraction-candidates/${encodeURIComponent(candidate.id)}`,
				{ payload },
			);
			await onChanged();
		} catch (cause) {
			setError(
				cause instanceof SyntaxError
					? "JSON 형식이 올바르지 않습니다."
					: "후보를 저장하지 못했습니다.",
			);
		} finally {
			setIsSaving(false);
		}
	}

	async function setIncludedStatus() {
		setIsSaving(true);
		setError(null);
		try {
			await api.post(
				`/extraction-candidates/${encodeURIComponent(candidate.id)}/${
					isRejected ? "approve" : "reject"
				}`,
			);
			await onChanged();
		} catch {
			setError("후보 상태를 바꾸지 못했습니다.");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<article className="rounded border border-slate-200 bg-white p-4">
			<div className="mb-2 flex items-center justify-between gap-3">
				<span className="font-mono text-slate-400 text-xs">
					#{candidate.id} {candidate.status}
				</span>
				<span className="rounded bg-slate-100 px-2 py-1 font-mono text-slate-500 text-xs">
					{candidate.candidate_type}
				</span>
			</div>
			<textarea
				value={draftPayload}
				disabled={!canEdit || isSaving}
				onChange={(event) => setDraftPayload(event.target.value)}
				className="h-52 w-full resize-y rounded border border-slate-200 bg-slate-50 p-3 font-mono text-slate-700 text-xs leading-5 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
			/>
			{error ? <p className="mt-2 text-red-700 text-xs">{error}</p> : null}
			<div className="mt-3 flex justify-end gap-2">
				<button
					type="button"
					disabled={!canEdit || isSaving}
					onClick={setIncludedStatus}
					className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 text-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
				>
					{isRejected ? "다시 포함" : "제외"}
				</button>
				<button
					type="button"
					disabled={!canEdit || isSaving}
					onClick={savePayload}
					className="rounded bg-slate-950 px-3 py-1.5 font-medium text-white text-xs transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
				>
					{isSaving ? "저장 중" : "저장"}
				</button>
			</div>
		</article>
	);
}
