import type { Article, ArticleListItem } from "@devgraph/shared";
import { queryOptions } from "@tanstack/react-query";
import { api, isNotFoundError } from "./api";

// 서버 상태 정의 한 곳. 컴포넌트는 "무엇을 가져오는지"만 알고 "어떻게"는 모른다.
export const articlesQueryOptions = queryOptions({
	queryKey: ["articles"],
	queryFn: async (): Promise<ArticleListItem[]> => {
		const { data } = await api.get<ArticleListItem[]>("/articles");
		return data;
	},
});

export const articleQueryOptions = (slug: string) =>
	queryOptions({
		queryKey: ["articles", slug],
		queryFn: async (): Promise<Article> => {
			// slug는 한글/특수문자를 포함할 수 있어 경로 세그먼트로 인코딩한다.
			const { data } = await api.get<Article>(
				`/articles/${encodeURIComponent(slug)}`,
			);
			return data;
		},
		// 404는 재시도해도 소용없으니 즉시 "없음" 뷰로. 그 외 에러만 한 번 더.
		retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
	});
