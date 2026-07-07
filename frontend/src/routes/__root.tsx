import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
	return (
		<div className="mx-auto max-w-2xl px-6 py-12">
			<header className="mb-10 border-slate-100 border-b pb-5">
				<Link
					to="/"
					className="font-mono font-semibold text-lg text-slate-900 tracking-tight transition-colors hover:text-indigo-600"
				>
					dev-graph
				</Link>
			</header>
			<Outlet />
		</div>
	);
}
