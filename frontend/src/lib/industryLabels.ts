import type { IndustryNode } from "@devgraph/shared";

export function nodeTypeLabel(type: IndustryNode["node_type"]): string {
	if (type === "commodity") return "상품/원재료";
	if (type === "process") return "공정/기능";
	return "사업자군/산업군";
}

export function nodeFill(type: IndustryNode["node_type"]): string {
	if (type === "commodity") return "#ecfeff";
	if (type === "process") return "#f8fafc";
	return "#fef3c7";
}

export function nodeStroke(type: IndustryNode["node_type"]): string {
	if (type === "commodity") return "#06b6d4";
	if (type === "process") return "#94a3b8";
	return "#f59e0b";
}
