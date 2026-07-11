import "dotenv/config";

// 환경변수 접근을 한 곳으로 모은다. 나머지 코드는 process.env 를 직접 읽지 않는다.
function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

export const config = {
	databaseUrl: required("DATABASE_URL"),
	// 단일 관리자 비밀번호. 로그인 시 이 값과 비교한다.
	adminPassword: process.env.ADMIN_PASSWORD ?? "devgraph-admin",
	// 세션 쿠키 서명 키. 배포에서는 반드시 재정의한다.
	sessionSecret: process.env.SESSION_SECRET ?? "dev-insecure-session-secret",
	// 실제 LLM 추출용. 없으면 llm 추출은 명확한 에러를 반환한다.
	anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
	anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
	contentDir: process.env.CONTENT_DIR ?? "../content",
	port: Number(process.env.PORT ?? 8080),
} as const;

export function hasAnthropicKey(): boolean {
	return config.anthropicApiKey.length > 0;
}
