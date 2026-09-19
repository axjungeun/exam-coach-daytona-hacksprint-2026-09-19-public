import { getRuntimeDatabase } from "./runtime-env";

const SESSION_COOKIE = "exam_coach_session";
const SESSION_DAYS = 30;
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type LearnerProfile = {
  id: string;
  nickname: string;
  createdAt: string;
  lastSeenAt: string;
};

type LearnerRow = {
  id: string;
  nickname: string;
  created_at: string;
  last_seen_at: string;
};

export function getLearnerDatabase(): D1Database | null {
  return getRuntimeDatabase();
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashSecret(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(digest);
}

function randomString(length: number, alphabet = CODE_ALPHABET) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function normalizeLearnerCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^EC/, "");
  return compact.length === 12 ? `EC-${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8)}` : "";
}

function makeLearnerCode() {
  return `EC-${randomString(4)}-${randomString(4)}-${randomString(4)}`;
}

function parseCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function sessionCookie(token: string, request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function toProfile(row: LearnerRow): LearnerProfile {
  return { id: row.id, nickname: row.nickname, createdAt: row.created_at, lastSeenAt: row.last_seen_at };
}

async function createSession(db: D1Database, learnerId: string, request: Request) {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.prepare(
    "INSERT INTO learner_sessions (session_hash, learner_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(await hashSecret(token), learnerId, now.toISOString(), expiresAt.toISOString()).run();
  return sessionCookie(token, request, SESSION_DAYS * 86_400);
}

export function validateNickname(value: string) {
  const nickname = value.trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 16) return null;
  if (!/^[\p{L}\p{N} _-]+$/u.test(nickname)) return null;
  return nickname;
}

export async function registerLearner(db: D1Database, nickname: string, request: Request) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const learnerCode = makeLearnerCode();
    try {
      await db.prepare(
        "INSERT INTO learners (id, nickname, learner_code_hash, created_at, last_seen_at, data_origin) VALUES (?, ?, ?, ?, ?, 'real')",
      ).bind(id, nickname, await hashSecret(learnerCode), now, now).run();
      return {
        learner: { id, nickname, createdAt: now, lastSeenAt: now } satisfies LearnerProfile,
        learnerCode,
        cookie: await createSession(db, id, request),
      };
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
  throw new Error("학습자 코드를 만들지 못했습니다.");
}

export async function loginLearner(db: D1Database, learnerCode: string, request: Request) {
  const row = await db.prepare(
    "SELECT id, nickname, created_at, last_seen_at FROM learners WHERE learner_code_hash = ? LIMIT 1",
  ).bind(await hashSecret(learnerCode)).first<LearnerRow>();
  if (!row) return null;
  const now = new Date().toISOString();
  await db.prepare("UPDATE learners SET last_seen_at = ? WHERE id = ?").bind(now, row.id).run();
  return {
    learner: { ...toProfile(row), lastSeenAt: now },
    cookie: await createSession(db, row.id, request),
  };
}

export async function authenticateLearner(request: Request, db = getLearnerDatabase()) {
  if (!db) return null;
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await db.prepare(
    `SELECT l.id, l.nickname, l.created_at, l.last_seen_at
     FROM learner_sessions s
     JOIN learners l ON l.id = s.learner_id
     WHERE s.session_hash = ? AND s.expires_at > ?
     LIMIT 1`,
  ).bind(await hashSecret(token), new Date().toISOString()).first<LearnerRow>();
  return row ? toProfile(row) : null;
}

export async function logoutLearner(db: D1Database, request: Request) {
  const token = parseCookie(request, SESSION_COOKIE);
  if (token) {
    await db.prepare("DELETE FROM learner_sessions WHERE session_hash = ?").bind(await hashSecret(token)).run();
  }
  return sessionCookie("", request, 0);
}
