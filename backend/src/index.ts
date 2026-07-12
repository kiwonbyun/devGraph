import express from "express";
import { auditRouter } from "./audit/routes";
import { authRouter } from "./auth/routes";
import { config } from "./config";
import { migrate, pool } from "./db";
import { extractionsRouter } from "./extractions/routes";
import { adminIndustryMapRouter } from "./industryMap/adminRoutes";
import { industryMapRouter } from "./industryMap/routes";
import { ingest } from "./ingest";
import { adminResearchNotesRouter } from "./researchNotes/adminRoutes";
import { researchNotesRouter } from "./researchNotes/routes";

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => {
	return res.json({ status: "ok" });
});

app.use("/api/admin", authRouter);
app.use("/api/admin", auditRouter);
app.use("/api/admin", adminIndustryMapRouter);
app.use("/api/admin/research-notes", adminResearchNotesRouter);
app.use("/api/admin", extractionsRouter);
app.use("/api/research-notes", researchNotesRouter);
app.use("/api/industry-map", industryMapRouter);

async function main() {
	const result = await pool.query("SELECT version()");
	console.log("DB connected:", result.rows[0]);
	await migrate(); // DB 연결 후 마이그레이션 수행

	const n = await ingest(config.contentDir);
	console.log(`ingested ${n} research notes`);

	app.listen(config.port, () =>
		console.log(`Server is running on port ${config.port}`),
	);
}

main().catch((err) => {
	console.error("Error starting the application:", err);
	process.exit(1);
});
