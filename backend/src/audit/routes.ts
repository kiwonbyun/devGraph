import { Router } from "express";
import { requireAdmin } from "../auth/middleware";
import { getGraphRevisions } from "./repo";

export const auditRouter = Router();
auditRouter.use(requireAdmin);

auditRouter.get("/graph-revisions", async (req, res) => {
	try {
		const limit = req.query.limit ? Number(req.query.limit) : undefined;
		const entityType =
			typeof req.query.entity_type === "string"
				? req.query.entity_type
				: undefined;
		const action =
			typeof req.query.action === "string" ? req.query.action : undefined;
		res.json(await getGraphRevisions({ limit, entityType, action }));
	} catch (error) {
		console.error("Error fetching graph revisions:", error);
		res.status(500).json({ error: "internal" });
	}
});
