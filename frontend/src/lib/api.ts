import axios from "axios";

// HTTP 클라이언트 한 곳. baseURL "/api"는 dev에서 Vite proxy → :8080,
// 배포 시 동일 오리진이라 코드 변경 없이 그대로 동작.
export const api = axios.create({ baseURL: "/api" });

// axios 지식은 이 파일에만 가둔다. 라우트/쿼리는 "404인가?"만 물으면 된다.
export function isNotFoundError(error: unknown): boolean {
	return axios.isAxiosError(error) && error.response?.status === 404;
}
