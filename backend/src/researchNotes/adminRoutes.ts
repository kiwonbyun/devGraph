import { Router } from "express";
import { requireAdmin } from "../auth/middleware";
import {
	createResearchNote,
	deleteResearchNote,
	getEvidenceForResearchNote,
	getResearchNote,
	getResearchNotes,
	updateResearchNote,
} from "./repo";

export const adminResearchNotesRouter = Router();
adminResearchNotesRouter.use(requireAdmin);

adminResearchNotesRouter.get("/", async (_req, res) => {
	try {
		res.json(await getResearchNotes(false));
	} catch (error) {
		console.error("Error listing research notes:", error);
		res.status(500).json({ error: "internal" });
	}
});

adminResearchNotesRouter.post("/", async (req, res) => {
	try {
		const title = asString(req.body?.title).trim();
		const body = asString(req.body?.body);
		if (!title) return res.status(400).json({ error: "title required" });
		const note = await createResearchNote({ title, body });
		return res.status(201).json(note);
	} catch (error) {
		console.error("Error creating research note:", error);
		res.status(500).json({ error: "internal" });
	}
});

adminResearchNotesRouter.get("/:slug", async (req, res) => {
	try {
		const note = await getResearchNote(req.params.slug, false);
		if (!note) return res.status(404).json({ error: "not found" });
		return res.json(note);
	} catch (error) {
		console.error("Error fetching research note:", error);
		res.status(500).json({ error: "internal" });
	}
});

adminResearchNotesRouter.get("/:slug/evidence", async (req, res) => {
	try {
		const note = await getResearchNote(req.params.slug, false);
		if (!note) return res.status(404).json({ error: "not found" });
		return res.json(await getEvidenceForResearchNote(req.params.slug, false));
	} catch (error) {
		console.error("Error fetching evidence:", error);
		res.status(500).json({ error: "internal" });
	}
});

adminResearchNotesRouter.put("/:slug", async (req, res) => {
	try {
		const patch: {
			title?: string;
			body?: string;
			status?: "draft" | "published";
		} = {};
		if (req.body?.title !== undefined) patch.title = asString(req.body.title);
		if (req.body?.body !== undefined) patch.body = asString(req.body.body);
		if (req.body?.status !== undefined) {
			if (req.body.status !== "draft" && req.body.status !== "published") {
				return res.status(400).json({ error: "invalid status" });
			}
			patch.status = req.body.status;
		}
		const note = await updateResearchNote(req.params.slug, patch);
		if (!note) return res.status(404).json({ error: "not found" });
		return res.json(note);
	} catch (error) {
		console.error("Error updating research note:", error);
		res.status(500).json({ error: "internal" });
	}
});

adminResearchNotesRouter.post("/:slug/publish", async (req, res) => {
	await setStatus(req.params.slug, "published", res);
});

adminResearchNotesRouter.post("/:slug/unpublish", async (req, res) => {
	await setStatus(req.params.slug, "draft", res);
});

adminResearchNotesRouter.delete("/:slug", async (req, res) => {
	try {
		const deleted = await deleteResearchNote(req.params.slug);
		if (!deleted) return res.status(404).json({ error: "not found" });
		return res.status(204).send();
	} catch (error) {
		console.error("Error deleting research note:", error);
		res.status(500).json({ error: "internal" });
	}
});

async function setStatus(
	slug: string,
	status: "draft" | "published",
	res: import("express").Response,
): Promise<void> {
	try {
		const note = await updateResearchNote(slug, { status });
		if (!note) {
			res.status(404).json({ error: "not found" });
			return;
		}
		res.json(note);
	} catch (error) {
		console.error("Error updating status:", error);
		res.status(500).json({ error: "internal" });
	}
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}
