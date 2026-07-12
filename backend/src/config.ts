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
	// LLM 추출 프로바이더: 'codex'(로컬 Codex CLI, ChatGPT 구독 사용) | 'openai'(API 키).
	llmProvider: (process.env.LLM_PROVIDER ?? "codex") as "codex" | "openai",

	// codex 경로: 로컬 Codex CLI 를 ChatGPT 로그인으로 사용 → API 키 불필요.
	codexBin: process.env.CODEX_BIN ?? "codex",
	codexModel: process.env.CODEX_MODEL ?? "", // 비어 있으면 Codex 기본 모델

	// openai 경로: API 키 종량제.
	openaiApiKey: process.env.OPENAI_API_KEY ?? "",
	openaiModel: process.env.OPENAI_MODEL ?? "gpt-5-codex",
	openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "",

	contentDir: process.env.CONTENT_DIR ?? "../content",
	port: Number(process.env.PORT ?? 8080),
} as const;

export function hasOpenaiKey(): boolean {
	return config.openaiApiKey.length > 0;
}
