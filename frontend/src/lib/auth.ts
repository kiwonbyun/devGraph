import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

export interface SessionState {
	authenticated: boolean;
}

export const sessionQueryOptions = queryOptions({
	queryKey: ["admin", "session"],
	queryFn: async (): Promise<SessionState> => {
		const { data } = await api.get<SessionState>("/admin/session");
		return data;
	},
	staleTime: 30_000,
});

export async function login(password: string): Promise<void> {
	await api.post("/admin/login", { password });
}

export async function logout(): Promise<void> {
	await api.post("/admin/logout");
}
