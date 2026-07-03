import { pool } from "../db";

export interface ArticleInput {
	slug: string;
	title: string;
	body: string;
	sourcePath: string;
	publishedAt: Date | null;
}

export async function upsertArticle(article: ArticleInput): Promise<void> {
	await pool.query(
		`INSERT INTO articles (slug, title, body, source_path, published_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            body = EXCLUDED.body,
            source_path = EXCLUDED.source_path,
            published_at = EXCLUDED.published_at,
            updated_at = now()`,
		[
			article.slug,
			article.title,
			article.body,
			article.sourcePath,
			article.publishedAt,
		],
	);
}

export interface ArticleListItem {
	slug: string;
	title: string;
	published_at: Date | null;
}
// 상세용 (전체)
export interface Article {
	id: number;
	slug: string;
	title: string;
	body: string;
	source_path: string;
	published_at: Date | null;
	created_at: Date;
	updated_at: Date;
}

export async function getArticles(): Promise<ArticleListItem[]> {
	const result = await pool.query(`
        SELECT slug, title, published_at FROM articles
        ORDER BY published_at DESC NULLS LAST, title ASC`);

	return result.rows;
}

export async function getArticle(slug: string): Promise<Article | null> {
	const result = await pool.query(
		`
        SELECT id, slug, title, body, source_path, published_at, created_at, updated_at
        FROM articles WHERE slug = $1`,
		[slug],
	);
	const row = result.rows[0];
	return row ? (row as Article) : null;
}
