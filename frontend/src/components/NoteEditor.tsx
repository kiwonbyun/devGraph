import { type ReactNode, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface NoteEditorProps {
	initialTitle: string;
	initialBody: string;
	saving: boolean;
	error: string | null;
	onSave: (values: { title: string; body: string }) => void;
	saveLabel?: string;
	actions?: ReactNode;
}

export function NoteEditor({
	initialTitle,
	initialBody,
	saving,
	error,
	onSave,
	saveLabel = "저장",
	actions,
}: NoteEditorProps) {
	const [title, setTitle] = useState(initialTitle);
	const [body, setBody] = useState(initialBody);
	const [showPreview, setShowPreview] = useState(false);

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<input
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="리서치 글 제목"
					className="flex-1 rounded border border-slate-300 px-3 py-2 font-semibold text-lg outline-none focus:border-slate-500"
				/>
				<button
					type="button"
					onClick={() => setShowPreview((value) => !value)}
					className="rounded border border-slate-200 px-3 py-2 text-slate-600 text-sm transition hover:bg-slate-50"
				>
					{showPreview ? "편집" : "미리보기"}
				</button>
				<button
					type="button"
					disabled={saving || title.trim().length === 0}
					onClick={() => onSave({ title: title.trim(), body })}
					className="rounded bg-slate-950 px-4 py-2 font-medium text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
				>
					{saving ? "저장 중" : saveLabel}
				</button>
				{actions}
			</div>
			{error ? <p className="text-red-700 text-sm">{error}</p> : null}
			{showPreview ? (
				<div className="prose prose-slate min-h-[24rem] max-w-none rounded border border-slate-200 bg-white p-4">
					<h1>{title}</h1>
					<Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
				</div>
			) : (
				<textarea
					value={body}
					onChange={(event) => setBody(event.target.value)}
					placeholder="본문 (마크다운). 빈 줄로 구분된 문단이 각각 근거(Evidence)가 됩니다."
					className="h-[28rem] w-full resize-y rounded border border-slate-200 bg-white p-4 font-mono text-slate-800 text-sm leading-6 outline-none focus:border-slate-400"
				/>
			)}
			<p className="text-slate-400 text-xs">
				빈 줄로 구분된 각 문단이 근거 문단(Evidence)으로 저장됩니다.
			</p>
		</div>
	);
}
