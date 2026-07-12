import { createRootRoute, createRoute } from "@tanstack/react-router";
import { RootLayout } from "./routes/__root";
import { AdminLayout } from "./routes/admin";
import { AuditLog } from "./routes/admin.audit";
import { AdminDashboard } from "./routes/admin.index";
import { AdminMap } from "./routes/admin.map";
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

const adminExtractionRunRoute = createRoute({
	getParentRoute: () => adminRoute,
	path: "extraction-runs/$runId",
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

const adminAuditRoute = createRoute({
	getParentRoute: () => adminRoute,
	path: "audit",
	component: AuditLog,
});

const adminMapRoute = createRoute({
	getParentRoute: () => adminRoute,
	path: "map",
	component: AdminMap,
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
	adminRoute.addChildren([
		adminIndexRoute,
		adminAuditRoute,
		adminMapRoute,
		adminNewNoteRoute,
		adminEditNoteRoute,
		adminExtractionRunRoute,
	]),
]);
