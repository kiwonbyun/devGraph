export function formatDate(iso: string | null): string {
	if (!iso) return "미발행";
	return new Date(iso).toLocaleDateString("ko-KR", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}
