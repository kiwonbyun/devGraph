export interface ArticleListItem {
	slug: string;
	title: string;
	published_at: string | null; // ISO 문자열
}

export interface Article {
	id: string; // pg BIGINT → 문자열
	slug: string;
	title: string;
	body: string;
	source_path: string;
	published_at: string | null;
	created_at: string;
	updated_at: string;
}
