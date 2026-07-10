import { Link, Outlet } from "@tanstack/react-router";

export function RootLayout() {
	return (
		<div className="min-h-screen bg-slate-50 px-5 py-5">
			<header className="mb-4 border-slate-200 border-b pb-4">
				<Link
					to="/"
					className="font-mono font-semibold text-lg text-slate-900 tracking-tight transition-colors hover:text-indigo-600"
				>
					industry-map
				</Link>
			</header>
			<Outlet />
		</div>
	);
}
