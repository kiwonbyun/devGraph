import { Router } from "express";
import { requireAdmin } from "../auth/middleware";
import { saveNodePositions } from "./repo";

export const adminIndustryMapRouter = Router();
adminIndustryMapRouter.use(requireAdmin);

adminIndustryMapRouter.post("/industry-nodes/positions", async (req, res) => {
	try {
		const body = req.body as {
			positions?: { id?: unknown; x?: unknown; y?: unknown }[];
		};
		if (!Array.isArray(body?.positions)) {
			return res.status(400).json({ error: "positions array required" });
		}
		const positions = body.positions
			.filter(
				(p) =>
					(typeof p.id === "string" || typeof p.id === "number") &&
					typeof p.x === "number" &&
					typeof p.y === "number",
			)
			.map((p) => ({ id: String(p.id), x: p.x as number, y: p.y as number }));
		await saveNodePositions(positions);
		return res.status(204).send();
	} catch (error) {
		console.error("Error saving node positions:", error);
		res.status(500).json({ error: "internal" });
	}
});
