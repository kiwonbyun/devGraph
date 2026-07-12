import { useEffect } from "react";

const SITE = "dev-graph 산업지도";
const DEFAULT_DESC =
	"관리자가 검수한 한국 산업 밸류체인을 근거 문단 단위로 구조화한 지식 그래프.";

function upsertMeta(attr: "name" | "property", key: string, content: string) {
	let el = document.head.querySelector<HTMLMetaElement>(
		`meta[${attr}="${key}"]`,
	);
	if (!el) {
		el = document.createElement("meta");
		el.setAttribute(attr, key);
		document.head.appendChild(el);
	}
	el.content = content;
}

function upsertCanonical(href: string) {
	let el = document.head.querySelector<HTMLLinkElement>(
		'link[rel="canonical"]',
	);
	if (!el) {
		el = document.createElement("link");
		el.rel = "canonical";
		document.head.appendChild(el);
	}
	el.href = href;
}

// SPA 페이지별 SEO/공유 메타를 설정한다: title, description, Open Graph, Twitter, canonical.
export function useDocumentMeta(title: string, description?: string): void {
	useEffect(() => {
		const fullTitle = title ? `${title} · ${SITE}` : SITE;
		const desc = (description ?? DEFAULT_DESC).slice(0, 300);
		const url = `${window.location.origin}${window.location.pathname}`;

		const previousTitle = document.title;
		document.title = fullTitle;

		upsertMeta("name", "description", desc);
		upsertMeta("property", "og:title", fullTitle);
		upsertMeta("property", "og:description", desc);
		upsertMeta("property", "og:type", "website");
		upsertMeta("property", "og:site_name", SITE);
		upsertMeta("property", "og:url", url);
		upsertMeta("name", "twitter:card", "summary");
		upsertMeta("name", "twitter:title", fullTitle);
		upsertMeta("name", "twitter:description", desc);
		upsertCanonical(url);

		return () => {
			document.title = previousTitle;
		};
	}, [title, description]);
}
