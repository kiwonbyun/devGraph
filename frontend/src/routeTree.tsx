import { createRootRoute, createRoute } from "@tanstack/react-router";
import { RootLayout } from "./routes/__root";
import { AdminLayout } from "./routes/admin";
import { AdminDashboard } from "./routes/admin.index";
import { EditResearchNote } from "./routes/admin.research-notes.$slug";
import { NewResearchNote } from "./routes/admin.research-notes.new";
import { ExtractionRunReview } from "./routes/extraction-runs.$runId";
import { Home } from "./routes/index";
import { IndustryNodeDetail } from "./routes/industry-nodes.$nodeId";
import { ResearchNoteDetail } from "./routes/research-notes.$slug";

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: Home,
});

const researchNoteRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/research-notes/$slug",
	component: ResearchNoteDetail,
});

const industryNodeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/industry-nodes/$nodeId",
	component: IndustryNodeDetail,
});

const extractionRunRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/extraction-runs/$runId",
	component: ExtractionRunReview,
});

const adminRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin",
	component: AdminLayout,
});

const adminIndexRoute = createRoute({
	getParentRoute: () => adminRoute,
	path: "/",
	component: AdminDashboard,
});

const adminNewNoteRoute = createRoute({
	getParentRoute: () => adminRoute,
	path: "research-notes/new",
	component: NewResearchNote,
});

const adminEditNoteRoute = createRoute({
	getParentRoute: () => adminRoute,
	path: "research-notes/$slug",
	component: EditResearchNote,
});

export const routeTree = rootRoute.addChildren([
	indexRoute,
	researchNoteRoute,
	industryNodeRoute,
	extractionRunRoute,
	adminRoute.addChildren([
		adminIndexRoute,
		adminNewNoteRoute,
		adminEditNoteRoute,
	]),
]);
