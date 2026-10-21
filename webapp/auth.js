// Demo login: a shared DEMO_KEY unlocks the app. A session is a signed cookie that carries its own
// expiry ("<expiresAt>.<HMAC(expiresAt)>"), so the server keeps no session state.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import express from "express";

const COOKIE_NAME = "demo_session";
const SESSION_MS = 12 * 60 * 60 * 1000;
const LOGIN_PAGE = readFileSync(new URL("./login.html", import.meta.url), "utf8");

/** Reads DEMO_KEY and COOKIE_SIGN_KEY from the Secrets Manager secret in SECRET_ARN. */
export async function loadSecrets() {
  const secretId = process.env.SECRET_ARN;
  if (!secretId) throw new Error("SECRET_ARN is not set");
  const { SecretString } = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: secretId }));
  const { DEMO_KEY, COOKIE_SIGN_KEY } = JSON.parse(SecretString);
  if (!DEMO_KEY || !COOKIE_SIGN_KEY) throw new Error("Secret must contain DEMO_KEY and COOKIE_SIGN_KEY");
  return { demoKey: DEMO_KEY, cookieSignKey: COOKIE_SIGN_KEY };
}

/** Router that serves /login and rejects every other request without a valid session cookie. */
export function createAuth({ demoKey, cookieSignKey }) {
  const sign = (value) => createHmac("sha256", cookieSignKey).update(value).digest("base64url");

  function hasValidSession(req) {
    const [expiresAt, signature] = (parseCookies(req.headers.cookie)[COOKIE_NAME] ?? "").split(".");
    if (!expiresAt || !signature || !safeEqual(signature, sign(expiresAt))) return false;
    return Number(expiresAt) > Date.now();
  }

  function renderLogin(res, status, { error = "", next = "/" } = {}) {
    res
      .status(status)
      .type("html")
      .send(LOGIN_PAGE.replace("{{error}}", error && `<p class="error">${escapeHtml(error)}</p>`).replace("{{next}}", escapeHtml(next)));
  }

  const router = express.Router();

  router.get("/login", (req, res) => {
    if (hasValidSession(req)) return res.redirect(safeNext(req.query.next));
    renderLogin(res, 200, { next: safeNext(req.query.next) });
  });

  router.post("/login", express.urlencoded({ extended: false, limit: "2kb" }), (req, res) => {
    const next = safeNext(req.body?.next);
    const key = typeof req.body?.demoKey === "string" ? req.body.demoKey : "";
    if (!safeEqual(key, demoKey)) return renderLogin(res, 401, { error: "Invalid demo key.", next });

    const expiresAt = String(Date.now() + SESSION_MS);
    res.cookie(COOKIE_NAME, `${expiresAt}.${sign(expiresAt)}`, {
      httpOnly: true,
      secure: !isLocalhost(req), // browsers drop Secure cookies on plain-HTTP localhost in some cases
      sameSite: "lax",
      maxAge: SESSION_MS,
      path: "/",
    });
    res.redirect(303, next);
  });

  // Everything else needs a session. API calls get 401 (the chat sends the browser to /login);
  // pages and static files redirect there directly.
  router.use((req, res, next) => {
    if (hasValidSession(req)) return next();
    if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Not signed in" });
    res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`);
  });

  return router;
}

// Compares fixed-length digests so timing doesn't reveal how much of a guess was right.
function safeEqual(a, b) {
  const digest = (s) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

// Only same-site paths, to avoid an open redirect through ?next=.
function safeNext(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/";
}

function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return cookies;
}

function isLocalhost(req) {
  return req.hostname === "localhost" || req.hostname === "127.0.0.1";
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
