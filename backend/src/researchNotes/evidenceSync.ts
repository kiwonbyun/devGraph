import { createHash } from "node:crypto";

export interface ExistingEvidenceIdentity {
	id: string;
	content_hash: string;
}

export interface EvidenceSyncItem {
	existingId?: string;
	ordinal: number;
	text: string;
	contentHash: string;
}

export interface EvidenceSyncPlan {
	items: EvidenceSyncItem[];
	staleIds: string[];
}

export function splitEvidenceParagraphs(markdown: string): string[] {
	return markdown
		.split(/\n\s*\n/g)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0);
}

export function planEvidenceSync(
	paragraphs: string[],
	existingRows: ExistingEvidenceIdentity[],
): EvidenceSyncPlan {
	const evidenceByHash = new Map<string, string[]>();
	const staleIds = new Set(existingRows.map((row) => row.id));
	for (const row of existingRows) {
		const ids = evidenceByHash.get(row.content_hash) ?? [];
		ids.push(row.id);
		evidenceByHash.set(row.content_hash, ids);
	}

	const items = paragraphs.map((text, index) => {
		const contentHash = hashText(text);
		const existingIds = evidenceByHash.get(contentHash);
		const existingId = existingIds?.shift();
		if (existingId) staleIds.delete(existingId);

		return {
			...(existingId ? { existingId } : {}),
			ordinal: index + 1,
			text,
			contentHash,
		};
	});

	return {
		items,
		staleIds: [...staleIds],
	};
}

export function hashText(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}
