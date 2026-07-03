import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

export const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

// migrations 폴더의 *.sql 을 이름순으로 실행. IF NOT EXISTS 라 멱등.
export async function migrate(): Promise<void> {
	const dir = join(__dirname, "..", "migrations");
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".sql"))
		.sort(); // 0001_, 0002_ ... 순서 보장
	for (const file of files) {
		const sql = readFileSync(join(dir, file), "utf8");
		await pool.query(sql);
		console.log(`migrated: ${file}`);
	}
}
