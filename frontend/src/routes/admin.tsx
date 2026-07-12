import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { login, logout, sessionQueryOptions } from "../lib/auth";

export function AdminLayout() {
	const session = useQuery(sessionQueryOptions);
	const queryClient = useQueryClient();

	if (session.isPending) {
		return <p className="font-mono text-slate-400 text-sm">불러오는 중…</p>;
	}

	if (!session.data?.authenticated) {
		return <LoginForm />;
	}

	return (
		<div>
			<div className="mb-6 flex items-center justify-between border-slate-200 border-b pb-4">
				<nav className="flex items-center gap-4 text-sm">
					<Link
						to="/admin"
						activeOptions={{ exact: true }}
						className="font-semibold text-slate-900 [&.active]:text-indigo-600"
					>
						리서치 글
					</Link>
					<Link
						to="/admin/map"
						className="text-slate-500 transition-colors [&.active]:font-semibold [&.active]:text-indigo-600"
					>
						지도 편집
					</Link>
					<Link
						to="/admin/audit"
						className="text-slate-500 transition-colors [&.active]:font-semibold [&.active]:text-indigo-600"
					>
						감사 로그
					</Link>
					<Link
						to="/"
						className="text-slate-400 transition-colors hover:text-indigo-600"
					>
						공개 지도 ↗
					</Link>
				</nav>
				<button
					type="button"
					onClick={async () => {
						await logout();
						await queryClient.invalidateQueries({
							queryKey: ["admin", "session"],
						});
					}}
					className="font-mono text-slate-400 text-xs transition-colors hover:text-slate-700"
				>
					로그아웃
				</button>
			</div>
			<Outlet />
		</div>
	);
}

function LoginForm() {
	const queryClient = useQueryClient();
	const routerState = useRouterState();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		setIsSubmitting(true);
		setError(null);
		try {
			await login(password);
			await queryClient.invalidateQueries({ queryKey: ["admin", "session"] });
		} catch {
			setError("비밀번호가 올바르지 않습니다.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="mx-auto mt-24 max-w-sm">
			<h1 className="font-semibold text-slate-950 text-xl">관리자 로그인</h1>
			<p className="mt-1 text-slate-500 text-sm">
				리서치 작성과 추출 검수는 관리자만 가능합니다.
			</p>
			<form onSubmit={onSubmit} className="mt-6 space-y-3">
				<input
					type="password"
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					placeholder="비밀번호"
					className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
				/>
				{error ? <p className="text-red-700 text-xs">{error}</p> : null}
				<button
					type="submit"
					disabled={isSubmitting || password.length === 0}
					className="w-full rounded bg-slate-950 px-3 py-2 font-medium text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
				>
					{isSubmitting ? "확인 중" : "로그인"}
				</button>
			</form>
			{routerState.location.pathname !== "/admin" ? (
				<p className="mt-4 font-mono text-slate-300 text-xs">
					{routerState.location.pathname}
				</p>
			) : null}
		</div>
	);
}
