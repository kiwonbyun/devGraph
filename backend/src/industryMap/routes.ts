import { Router } from "express";
import { getIndustryMap } from "./repo";

export const industryMapRouter = Router();

industryMapRouter.get("/", async (_req, res) => {
	try {
		res.json(await getIndustryMap());
	} catch (error) {
		console.error("Error fetching industry map:", error);
		res.status(500).json({ error: "internal" });
	}
});
