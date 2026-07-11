import { useEffect } from "react";

const SITE = "dev-graph 산업지도";

// SPA 페이지별 document.title 과 meta[name=description] 를 설정한다 (기본 SEO).
export function useDocumentMeta(title: string, description?: string): void {
	useEffect(() => {
		const previousTitle = document.title;
		document.title = title ? `${title} · ${SITE}` : SITE;

		let meta: HTMLMetaElement | null = null;
		let created = false;
		if (description !== undefined) {
			meta = document.querySelector('meta[name="description"]');
			if (!meta) {
				meta = document.createElement("meta");
				meta.name = "description";
				document.head.appendChild(meta);
				created = true;
			}
			meta.content = description.slice(0, 300);
		}

		return () => {
			document.title = previousTitle;
			if (created && meta) meta.remove();
		};
	}, [title, description]);
}
