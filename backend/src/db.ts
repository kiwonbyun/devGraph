import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { config } from "./config";

export const pool = new Pool({
	connectionString: config.databaseUrl,
});

// migrations 폴더의 *.sql 을 이름순으로 실행한다.
// schema_migrations 로 적용 이력을 추적하고, 각 파일을 한 트랜잭션으로 실행한다.
export async function migrate(): Promise<void> {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`);

	const applied = new Set(
		(
			await pool.query<{ filename: string }>(
				"SELECT filename FROM schema_migrations",
			)
		).rows.map((row) => row.filename),
	);

	const dir = join(__dirname, "..", "migrations");
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".sql"))
		.sort(); // 0001_, 0002_ ... 순서 보장

	for (const file of files) {
		if (applied.has(file)) {
			console.log(`skip migration (applied): ${file}`);
			continue;
		}
		const sql = readFileSync(join(dir, file), "utf8");
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			await client.query(sql);
			await client.query(
				"INSERT INTO schema_migrations (filename) VALUES ($1)",
				[file],
			);
			await client.query("COMMIT");
			console.log(`migrated: ${file}`);
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}
}
