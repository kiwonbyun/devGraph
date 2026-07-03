import { Router } from "express";
import { getArticle, getArticles } from "./repo";

export const articlesRouter = Router();

articlesRouter.get("/", async (_req, res) => {
	try {
		res.json(await getArticles());
	} catch (error) {
		console.error("Error fetching articles:", error);
		res.status(500).json({ error: "internal" });
	}
});

articlesRouter.get("/:slug", async (req, res) => {
	try {
		const article = await getArticle(req.params.slug);
		if (!article) {
			return res.status(404).json({ error: "not found" });
		}
		return res.json(article);
	} catch (error) {
		console.error("Error fetching article:", error);
		res.status(500).json({ error: "internal" });
	}
});
