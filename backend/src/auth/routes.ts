import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { config } from "../config";
import {
	isValidSession,
	readSessionCookie,
	SESSION_COOKIE,
	sessionCookieOptions,
	signSession,
} from "./session";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
	const body = req.body as { password?: unknown };
	const password = typeof body?.password === "string" ? body.password : "";
	if (!passwordMatches(password)) {
		return res.status(401).json({ error: "invalid password" });
	}
	res.cookie(SESSION_COOKIE, signSession(Date.now()), sessionCookieOptions);
	return res.json({ authenticated: true });
});

authRouter.post("/logout", (_req, res) => {
	res.clearCookie(SESSION_COOKIE, { path: "/" });
	res.json({ authenticated: false });
});

authRouter.get("/session", (req, res) => {
	res.json({ authenticated: isValidSession(readSessionCookie(req)) });
});

function passwordMatches(input: string): boolean {
	const a = Buffer.from(input);
	const b = Buffer.from(config.adminPassword);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
