import type { ResearchNote } from "@devgraph/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { NoteEditor } from "../components/NoteEditor";
import { api } from "../lib/api";

export function NewResearchNote() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	return (
		<div className="space-y-4">
			<Link
				to="/admin"
				className="font-mono text-slate-400 text-xs transition-colors hover:text-indigo-600"
			>
				← 리서치 글
			</Link>
			<NoteEditor
				initialTitle=""
				initialBody=""
				saving={saving}
				error={error}
				saveLabel="초안 저장"
				onSave={async ({ title, body }) => {
					setSaving(true);
					setError(null);
					try {
						const { data } = await api.post<ResearchNote>(
							"/admin/research-notes",
							{ title, body },
						);
						await queryClient.invalidateQueries({
							queryKey: ["admin", "research-notes"],
						});
						await navigate({
							to: "/admin/research-notes/$slug",
							params: { slug: data.slug },
						});
					} catch {
						setError("저장하지 못했습니다.");
					} finally {
						setSaving(false);
					}
				}}
			/>
		</div>
	);
}
