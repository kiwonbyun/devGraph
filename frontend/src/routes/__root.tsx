import { Link, Outlet } from "@tanstack/react-router";

export function RootLayout() {
	return (
		<div className="min-h-screen bg-slate-50 px-5 py-5">
			<header className="mb-4 flex items-center justify-between border-slate-200 border-b pb-4">
				<Link
					to="/"
					className="font-mono font-semibold text-lg text-slate-900 tracking-tight transition-colors hover:text-indigo-600"
				>
					industry-map
				</Link>
				<Link
					to="/admin"
					className="font-mono text-slate-400 text-xs transition-colors hover:text-indigo-600"
				>
					관리자
				</Link>
			</header>
			<Outlet />
		</div>
	);
}
