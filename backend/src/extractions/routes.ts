import { Router } from "express";
import {
	approveExtractionRun,
	createSampleExtractionRun,
	getExtractionRunDetail,
	getExtractionRuns,
} from "./repo";

export const extractionsRouter = Router();

extractionsRouter.get(
	"/research-notes/:slug/extraction-runs",
	async (req, res) => {
		try {
			res.json(await getExtractionRuns(req.params.slug));
		} catch (error) {
			console.error("Error fetching extraction runs:", error);
			res.status(500).json({ error: "internal" });
		}
	},
);

extractionsRouter.post(
	"/research-notes/:slug/extraction-runs/sample",
	async (req, res) => {
		try {
			res.status(201).json(await createSampleExtractionRun(req.params.slug));
		} catch (error) {
			console.error("Error creating extraction run:", error);
			res.status(500).json({ error: "internal" });
		}
	},
);

extractionsRouter.get("/extraction-runs/:runId", async (req, res) => {
	try {
		const run = await getExtractionRunDetail(req.params.runId);
		if (!run) return res.status(404).json({ error: "not found" });
		return res.json(run);
	} catch (error) {
		console.error("Error fetching extraction run:", error);
		res.status(500).json({ error: "internal" });
	}
});

extractionsRouter.post("/extraction-runs/:runId/approve", async (req, res) => {
	try {
		await approveExtractionRun(req.params.runId);
		res.status(204).send();
	} catch (error) {
		console.error("Error approving extraction run:", error);
		res.status(500).json({ error: "internal" });
	}
});
