import type {
	Evidence,
	ExtractionRunDetail,
	ExtractionRunListItem,
	GraphRevisionItem,
	IndustryMap,
	ResearchNote,
	ResearchNoteListItem,
} from "@devgraph/shared";
import { queryOptions } from "@tanstack/react-query";
import { api, isNotFoundError } from "./api";

// 서버 상태 정의 한 곳. 컴포넌트는 "무엇을 가져오는지"만 알고 "어떻게"는 모른다.
export const researchNotesQueryOptions = queryOptions({
	queryKey: ["research-notes"],
	queryFn: async (): Promise<ResearchNoteListItem[]> => {
		const { data } = await api.get<ResearchNoteListItem[]>("/research-notes");
		return data;
	},
});

export const researchNoteQueryOptions = (slug: string) =>
	queryOptions({
		queryKey: ["research-notes", slug],
		queryFn: async (): Promise<ResearchNote> => {
			// slug는 한글/특수문자를 포함할 수 있어 경로 세그먼트로 인코딩한다.
			const { data } = await api.get<ResearchNote>(
				`/research-notes/${encodeURIComponent(slug)}`,
			);
			return data;
		},
		// 404는 재시도해도 소용없으니 즉시 "없음" 뷰로. 그 외 에러만 한 번 더.
		retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
	});

export const evidenceQueryOptions = (slug: string) =>
	queryOptions({
		queryKey: ["research-notes", slug, "evidence"],
		queryFn: async (): Promise<Evidence[]> => {
			const { data } = await api.get<Evidence[]>(
				`/research-notes/${encodeURIComponent(slug)}/evidence`,
			);
			return data;
		},
		retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
	});

// --- 관리자 전용 (모든 상태 포함) ---
export const adminResearchNotesQueryOptions = queryOptions({
	queryKey: ["admin", "research-notes"],
	queryFn: async (): Promise<ResearchNoteListItem[]> => {
		const { data } = await api.get<ResearchNoteListItem[]>(
			"/admin/research-notes",
		);
		return data;
	},
});

export const adminResearchNoteQueryOptions = (slug: string) =>
	queryOptions({
		queryKey: ["admin", "research-notes", slug],
		queryFn: async (): Promise<ResearchNote> => {
			const { data } = await api.get<ResearchNote>(
				`/admin/research-notes/${encodeURIComponent(slug)}`,
			);
			return data;
		},
		retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
	});

export const adminEvidenceQueryOptions = (slug: string) =>
	queryOptions({
		queryKey: ["admin", "research-notes", slug, "evidence"],
		queryFn: async (): Promise<Evidence[]> => {
			const { data } = await api.get<Evidence[]>(
				`/admin/research-notes/${encodeURIComponent(slug)}/evidence`,
			);
			return data;
		},
		retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
	});

export const adminGraphRevisionsQueryOptions = queryOptions({
	queryKey: ["admin", "graph-revisions"],
	queryFn: async (): Promise<GraphRevisionItem[]> => {
		const { data } = await api.get<GraphRevisionItem[]>(
			"/admin/graph-revisions",
		);
		return data;
	},
});

export const industryMapQueryOptions = queryOptions({
	queryKey: ["industry-map"],
	queryFn: async (): Promise<IndustryMap> => {
		const { data } = await api.get<IndustryMap>("/industry-map");
		return data;
	},
});

export const extractionRunsQueryOptions = (slug: string) =>
	queryOptions({
		queryKey: ["admin", "extraction-runs", "note", slug],
		queryFn: async (): Promise<ExtractionRunListItem[]> => {
			const { data } = await api.get<ExtractionRunListItem[]>(
				`/admin/research-notes/${encodeURIComponent(slug)}/extraction-runs`,
			);
			return data;
		},
		retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
	});

export const extractionRunQueryOptions = (runId: string) =>
	queryOptions({
		queryKey: ["admin", "extraction-runs", runId],
		queryFn: async (): Promise<ExtractionRunDetail> => {
			const { data } = await api.get<ExtractionRunDetail>(
				`/admin/extraction-runs/${encodeURIComponent(runId)}`,
			);
			return data;
		},
		retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
	});
