import { Router } from "express";
import { requireAdmin } from "../auth/middleware";
import type { CandidateType } from "./candidateTypes";
import {
	addExtractionCandidate,
	approveExtractionRun,
	createLlmExtractionRun,
	createSampleExtractionRun,
	getExtractionRunDetail,
	getExtractionRuns,
	searchCompanies,
	searchIndustryNodes,
	updateExtractionCandidate,
} from "./repo";

const CANDIDATE_TYPES: CandidateType[] = [
	"node",
	"edge",
	"company_role",
	"node_relation",
	"cluster",
	"alias",
];

// 추출/검수는 전부 관리자 전용. /api/admin 아래에 마운트한다.
export const extractionsRouter = Router();
extractionsRouter.use(requireAdmin);

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

// 실제 LLM 추출.
extractionsRouter.post(
	"/research-notes/:slug/extraction-runs",
	async (req, res) => {
		try {
			res.status(201).json(await createLlmExtractionRun(req.params.slug));
		} catch (error) {
			console.error("Error creating LLM extraction run:", error);
			res.status(502).json({
				error: "extraction_failed",
				message: error instanceof Error ? error.message : "unknown",
			});
		}
	},
);

// 개발/테스트용 샘플 추출.
extractionsRouter.post(
	"/research-notes/:slug/extraction-runs/sample",
	async (req, res) => {
		try {
			res.status(201).json(await createSampleExtractionRun(req.params.slug));
		} catch (error) {
			console.error("Error creating sample extraction run:", error);
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

extractionsRouter.get("/industry-nodes/search", async (req, res) => {
	try {
		const q = typeof req.query.q === "string" ? req.query.q : "";
		res.json(await searchIndustryNodes(q));
	} catch (error) {
		console.error("Error searching industry nodes:", error);
		res.status(500).json({ error: "internal" });
	}
});

extractionsRouter.get("/companies/search", async (req, res) => {
	try {
		const q = typeof req.query.q === "string" ? req.query.q : "";
		res.json(await searchCompanies(q));
	} catch (error) {
		console.error("Error searching companies:", error);
		res.status(500).json({ error: "internal" });
	}
});

extractionsRouter.post(
	"/extraction-runs/:runId/candidates",
	async (req, res) => {
		try {
			if (!isRecord(req.body)) {
				return res.status(400).json({ error: "invalid body" });
			}
			const candidateType = req.body.candidate_type;
			if (
				typeof candidateType !== "string" ||
				!CANDIDATE_TYPES.includes(candidateType as CandidateType)
			) {
				return res.status(400).json({ error: "invalid candidate_type" });
			}
			const candidate = await addExtractionCandidate(
				req.params.runId,
				candidateType as CandidateType,
				req.body.payload,
			);
			if (!candidate) return res.status(404).json({ error: "not found" });
			return res.status(201).json(candidate);
		} catch (error) {
			console.error("Error adding extraction candidate:", error);
			res.status(500).json({ error: "internal" });
		}
	},
);

extractionsRouter.post("/extraction-runs/:runId/approve", async (req, res) => {
	try {
		await approveExtractionRun(req.params.runId);
		res.status(204).send();
	} catch (error) {
		console.error("Error approving extraction run:", error);
		res.status(500).json({ error: "internal" });
	}
});

extractionsRouter.patch(
	"/extraction-candidates/:candidateId",
	async (req, res) => {
		try {
			if (!isRecord(req.body)) {
				return res.status(400).json({ error: "invalid body" });
			}
			const status = req.body.status;
			if (
				status !== undefined &&
				status !== "pending" &&
				status !== "rejected"
			) {
				return res.status(400).json({ error: "invalid status" });
			}

			const input: Parameters<typeof updateExtractionCandidate>[1] = {};
			if (status === "pending" || status === "rejected") {
				input.status = status;
			}
			if (Object.hasOwn(req.body, "payload")) {
				input.payload = req.body.payload;
			}

			const candidate = await updateExtractionCandidate(
				req.params.candidateId,
				input,
			);
			if (!candidate) return res.status(404).json({ error: "not found" });
			return res.json(candidate);
		} catch (error) {
			console.error("Error updating extraction candidate:", error);
			res.status(500).json({ error: "internal" });
		}
	},
);

extractionsRouter.post(
	"/extraction-candidates/:candidateId/reject",
	async (req, res) => {
		try {
			const candidate = await updateExtractionCandidate(
				req.params.candidateId,
				{ status: "rejected" },
			);
			if (!candidate) return res.status(404).json({ error: "not found" });
			return res.json(candidate);
		} catch (error) {
			console.error("Error rejecting extraction candidate:", error);
			res.status(500).json({ error: "internal" });
		}
	},
);

extractionsRouter.post(
	"/extraction-candidates/:candidateId/approve",
	async (req, res) => {
		try {
			const candidate = await updateExtractionCandidate(
				req.params.candidateId,
				{ status: "pending" },
			);
			if (!candidate) return res.status(404).json({ error: "not found" });
			return res.json(candidate);
		} catch (error) {
			console.error("Error approving extraction candidate:", error);
			res.status(500).json({ error: "internal" });
		}
	},
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
