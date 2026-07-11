import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { config } from "../config";

export const SESSION_COOKIE = "dg_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7일

// payload(base64).signature(hex) 형태의 서명 토큰을 만든다.
export function signSession(issuedAt: number): string {
	const payload = Buffer.from(`admin:${issuedAt}`).toString("base64url");
	const signature = sign(payload);
	return `${payload}.${signature}`;
}

export function isValidSession(token: string | undefined): boolean {
	if (!token) return false;
	const [payload, signature] = token.split(".");
	if (!payload || !signature) return false;

	const expected = sign(payload);
	if (!safeEqual(signature, expected)) return false;

	const decoded = Buffer.from(payload, "base64url").toString("utf8");
	const [role, issuedAtRaw] = decoded.split(":");
	if (role !== "admin") return false;

	const issuedAt = Number(issuedAtRaw);
	if (!Number.isFinite(issuedAt)) return false;
	if (Date.now() - issuedAt > MAX_AGE_MS) return false;

	return true;
}

export function readSessionCookie(req: Request): string | undefined {
	const header = req.headers.cookie;
	if (!header) return undefined;
	for (const part of header.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
	}
	return undefined;
}

export const sessionCookieOptions = {
	httpOnly: true,
	sameSite: "lax" as const,
	path: "/",
	maxAge: MAX_AGE_MS,
	secure: false, // 로컬 개발(http)용. 배포 시 true 로.
};

function sign(payload: string): string {
	return createHmac("sha256", config.sessionSecret)
		.update(payload)
		.digest("hex");
}

function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}
