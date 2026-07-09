const crypto = require("crypto");
const { readCollection, nowIso } = require("./store");

let pool = null;
let postgresReady = false;
const usersById = new Map();
const usersByEmail = new Map();
const sessionsByToken = new Map();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toIso(value) {
  if (!value) return nowIso();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? nowIso() : date.toISOString();
}

function mapUser(row) {
  return {
    id: row.id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    status: row.status || "active",
    email: row.email,
    emailNormalized: row.email_normalized || normalizeEmail(row.email),
    passwordHash: row.password_hash,
    plan: row.plan || "free",
    quota: row.quota || {},
    quotaResetAt: toIso(row.quota_reset_at || row.created_at),
  };
}

function mapSession(row) {
  return {
    id: row.id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    status: row.status || "active",
    userId: row.user_id,
    token: row.token,
    expiresAt: toIso(row.expires_at),
  };
}

function cacheUser(user) {
  usersById.set(user.id, user);
  const email = normalizeEmail(user.emailNormalized || user.email);
  if (!usersByEmail.has(email)) usersByEmail.set(email, []);
  const peers = usersByEmail.get(email).filter((item) => item.id !== user.id);
  usersByEmail.set(email, [user, ...peers]);
  return user;
}

function cacheSession(session) {
  sessionsByToken.set(session.token, session);
  return session;
}

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      email_normalized TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      quota JSONB NOT NULL DEFAULT '{}'::jsonb,
      quota_reset_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
}

async function migrateJsonAuthData() {
  const users = readCollection("users");
  for (const user of users) {
    const emailNormalized = normalizeEmail(user.emailNormalized || user.email);
    if (!emailNormalized || !user.passwordHash) continue;
    await pool.query(
      `INSERT INTO users (
        id, email, email_normalized, password_hash, plan, quota, quota_reset_at, status, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (email_normalized) DO NOTHING`,
      [
        user.id || makeId("user"),
        user.email || emailNormalized,
        emailNormalized,
        user.passwordHash,
        user.plan || "free",
        user.quota || {},
        user.quotaResetAt || user.createdAt || nowIso(),
        user.status || "active",
        user.createdAt || nowIso(),
        user.updatedAt || user.createdAt || nowIso(),
      ]
    );
  }

  const validUserIds = new Set((await pool.query("SELECT id FROM users")).rows.map((row) => row.id));
  const sessions = readCollection("sessions");
  for (const session of sessions) {
    if (!session.userId || !session.token || !session.expiresAt || !validUserIds.has(session.userId)) continue;
    await pool.query(
      `INSERT INTO sessions (id, user_id, token, expires_at, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (token) DO NOTHING`,
      [
        session.id || makeId("session"),
        session.userId,
        session.token,
        session.expiresAt,
        session.status || "active",
        session.createdAt || nowIso(),
        session.updatedAt || session.createdAt || nowIso(),
      ]
    );
  }
}

async function loadCache() {
  usersById.clear();
  usersByEmail.clear();
  sessionsByToken.clear();

  const users = await pool.query("SELECT * FROM users WHERE status <> 'deleted' ORDER BY created_at DESC");
  users.rows.map(mapUser).forEach(cacheUser);

  const sessions = await pool.query("SELECT * FROM sessions WHERE expires_at > NOW() AND status <> 'deleted'");
  sessions.rows.map(mapSession).forEach(cacheSession);
}

async function initAuthStore() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  const sslMode = String(process.env.PGSSLMODE || process.env.DATABASE_SSL || "").toLowerCase();
  if (!databaseUrl) return false;
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslMode === "require" || sslMode === "true" ? { rejectUnauthorized: false } : false,
  });
  await runMigrations();
  await migrateJsonAuthData();
  await loadCache();
  postgresReady = true;
  return true;
}

function isPostgresAuthEnabled() {
  return postgresReady;
}

function getUserByIdSync(id) {
  return usersById.get(id) || null;
}

function getUsersByEmailSync(email) {
  return usersByEmail.get(normalizeEmail(email)) || [];
}

function getSessionByTokenSync(token) {
  return sessionsByToken.get(token) || null;
}

async function createUser(payload) {
  if (!postgresReady) throw new Error("PostgreSQL auth store is not initialized.");
  const createdAt = payload.createdAt || nowIso();
  const user = {
    id: payload.id || makeId("user"),
    email: payload.email,
    emailNormalized: normalizeEmail(payload.emailNormalized || payload.email),
    passwordHash: payload.passwordHash,
    plan: payload.plan || "free",
    quota: payload.quota || {},
    quotaResetAt: payload.quotaResetAt || createdAt,
    status: payload.status || "active",
    createdAt,
    updatedAt: payload.updatedAt || createdAt,
  };
  const result = await pool.query(
    `INSERT INTO users (
      id, email, email_normalized, password_hash, plan, quota, quota_reset_at, status, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *`,
    [
      user.id,
      user.email,
      user.emailNormalized,
      user.passwordHash,
      user.plan,
      user.quota,
      user.quotaResetAt,
      user.status,
      user.createdAt,
      user.updatedAt,
    ]
  );
  return cacheUser(mapUser(result.rows[0]));
}

async function createSession(payload) {
  if (!postgresReady) throw new Error("PostgreSQL auth store is not initialized.");
  const createdAt = payload.createdAt || nowIso();
  const session = {
    id: payload.id || makeId("session"),
    userId: payload.userId,
    token: payload.token || crypto.randomBytes(32).toString("hex"),
    expiresAt: payload.expiresAt,
    status: payload.status || "active",
    createdAt,
    updatedAt: payload.updatedAt || createdAt,
  };
  const result = await pool.query(
    `INSERT INTO sessions (id, user_id, token, expires_at, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [session.id, session.userId, session.token, session.expiresAt, session.status, session.createdAt, session.updatedAt]
  );
  return cacheSession(mapSession(result.rows[0]));
}

async function deleteSession(id) {
  if (!postgresReady || !id) return false;
  await pool.query("DELETE FROM sessions WHERE id = $1", [id]);
  for (const [token, session] of sessionsByToken.entries()) {
    if (session.id === id) sessionsByToken.delete(token);
  }
  return true;
}

async function incrementUserQuota(userId, key) {
  if (!postgresReady) throw new Error("PostgreSQL auth store is not initialized.");
  const current = usersById.get(userId);
  if (!current) return null;
  const quota = {
    ...(current.quota || {}),
    [key]: Number(current.quota?.[key] || 0) + 1,
  };
  const result = await pool.query(
    "UPDATE users SET quota = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    [quota, userId]
  );
  if (!result.rows[0]) return null;
  return cacheUser(mapUser(result.rows[0]));
}

module.exports = {
  initAuthStore,
  isPostgresAuthEnabled,
  getUserByIdSync,
  getUsersByEmailSync,
  getSessionByTokenSync,
  createUser,
  createSession,
  deleteSession,
  incrementUserQuota,
};
