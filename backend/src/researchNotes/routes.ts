import { Router } from "express";
import {
	getEvidenceForResearchNote,
	getResearchNote,
	getResearchNotes,
} from "./repo";

export const researchNotesRouter = Router();

researchNotesRouter.get("/", async (_req, res) => {
	try {
		res.json(await getResearchNotes(true));
	} catch (error) {
		console.error("Error fetching research notes:", error);
		res.status(500).json({ error: "internal" });
	}
});

researchNotesRouter.get("/:slug", async (req, res) => {
	try {
		const note = await getResearchNote(req.params.slug, true);
		if (!note) {
			return res.status(404).json({ error: "not found" });
		}
		return res.json(note);
	} catch (error) {
		console.error("Error fetching research note:", error);
		res.status(500).json({ error: "internal" });
	}
});

researchNotesRouter.get("/:slug/evidence", async (req, res) => {
	try {
		const note = await getResearchNote(req.params.slug, true);
		if (!note) {
			return res.status(404).json({ error: "not found" });
		}
		return res.json(await getEvidenceForResearchNote(req.params.slug, true));
	} catch (error) {
		console.error("Error fetching evidence:", error);
		res.status(500).json({ error: "internal" });
	}
});
