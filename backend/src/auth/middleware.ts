import type { NextFunction, Request, Response } from "express";
import { isValidSession, readSessionCookie } from "./session";

// 관리자 전용 라우트 가드. 유효한 세션 쿠키가 없으면 401.
export function requireAdmin(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	if (isValidSession(readSessionCookie(req))) {
		next();
		return;
	}
	res.status(401).json({ error: "unauthorized" });
}
