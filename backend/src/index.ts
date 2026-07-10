import "dotenv/config";
import express from "express";
import { migrate, pool } from "./db";
import { extractionsRouter } from "./extractions/routes";
import { industryMapRouter } from "./industryMap/routes";
import { ingest } from "./ingest";
import { researchNotesRouter } from "./researchNotes/routes";

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => {
	return res.json({ status: "ok" });
});

app.use("/api/research-notes", researchNotesRouter);
app.use("/api/industry-map", industryMapRouter);
app.use("/api", extractionsRouter);

async function main() {
	const result = await pool.query("SELECT version()");
	console.log("DB connected:", result.rows[0]);
	await migrate(); // DB 연결 후 마이그레이션 수행

	const contentDir = process.env.CONTENT_DIR ?? "../content";
	const n = await ingest(contentDir);
	console.log(`ingested ${n} articles`);

	app.listen(8080, () => console.log("Server is running on port 8080"));
}

main().catch((err) => {
	console.error("Error starting the application:", err);
	process.exit(1);
});
