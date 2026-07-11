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
	// 실제 LLM 추출용(OpenAI/Codex). 없으면 llm 추출은 명확한 에러를 반환한다.
	openaiApiKey: process.env.OPENAI_API_KEY ?? "",
	openaiModel: process.env.OPENAI_MODEL ?? "gpt-5-codex",
	// 필요 시 base URL 재정의 (Azure/프록시 등). 비어 있으면 SDK 기본값.
	openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "",
	contentDir: process.env.CONTENT_DIR ?? "../content",
	port: Number(process.env.PORT ?? 8080),
} as const;

export function hasLlmKey(): boolean {
	return config.openaiApiKey.length > 0;
}
