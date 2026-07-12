import { useEffect } from "react";

export interface ConfirmModalProps {
	open: boolean;
	title: string;
	message?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	danger?: boolean;
	busy?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

// 모든 삭제/파괴적 동작에 쓰는 확인 모달. open=true 일 때만 렌더.
export function ConfirmModal({
	open,
	title,
	message,
	confirmLabel = "삭제",
	cancelLabel = "취소",
	danger = true,
	busy = false,
	onConfirm,
	onCancel,
}: ConfirmModalProps) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !busy) onCancel();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, busy, onCancel]);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
			onClick={() => {
				if (!busy) onCancel();
			}}
			onKeyDown={() => {}}
			role="presentation"
		>
			<div
				className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
			>
				<h2 className="font-semibold text-slate-950 text-lg">{title}</h2>
				{message ? (
					<p className="mt-2 text-slate-600 text-sm leading-6">{message}</p>
				) : null}
				<div className="mt-5 flex justify-end gap-2">
					<button
						type="button"
						disabled={busy}
						onClick={onCancel}
						className="rounded border border-slate-200 px-3 py-2 font-medium text-slate-700 text-sm transition hover:bg-slate-50 disabled:opacity-50"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={onConfirm}
						className={`rounded px-3 py-2 font-medium text-sm text-white transition disabled:opacity-50 ${
							danger
								? "bg-red-600 hover:bg-red-700"
								: "bg-slate-950 hover:bg-slate-800"
						}`}
					>
						{busy ? "처리 중" : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
