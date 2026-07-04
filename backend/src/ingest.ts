import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import matter from "gray-matter";
import { upsertArticle } from "./articles/repo";

export async function ingest(contentDir: string): Promise<number> {
	const files = readdirSync(contentDir).filter((f) => f.endsWith(".md"));
	let count = 0;

	for (const file of files) {
		const raw = readFileSync(join(contentDir, file), "utf-8");
		const { data, content } = matter(raw);

		const name = basename(file, extname(file)); // 파일 이름에서 확장자를 제거한 이름
		const slug = data?.slug ?? slugify(name);
		const title = data?.title ?? firstHeading(content) ?? name;
		const dateRaw = data?.date ? new Date(data.date) : null;

		const input = {
			slug,
			title,
			body: content,
			sourcePath: file,
			publishedAt: dateRaw && !Number.isNaN(dateRaw.getTime()) ? dateRaw : null,
		};
		await upsertArticle(input);
		count++;
	}

	return count;
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
}
function firstHeading(md: string): string | undefined {
	return md.match(/^#\s+(.+)$/m)?.[1]?.trim();
}
