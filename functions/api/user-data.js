import { currentUser, json } from "../_shared/auth.js";

const DEFAULT_DATA = { preferredHost: "codex" };
const ALLOWED_HOSTS = new Set(["codex", "claude", "standalone"]);

export async function onRequestGet({ env, request }) {
  const user = await currentUser(env, request);
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  const row = await env.CUTPILOT_DB.prepare("SELECT data, updated_at FROM user_data WHERE user_id = ?").bind(user.id).first();
  return json({ ok: true, data: row ? JSON.parse(row.data) : DEFAULT_DATA, updated_at: row?.updated_at || 0 });
}

export async function onRequestPut({ env, request }) {
  const user = await currentUser(env, request);
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || !ALLOWED_HOSTS.has(body.preferredHost)) return json({ ok: false, error: "bad payload" }, 400);
  const data = JSON.stringify({ preferredHost: body.preferredHost });
  const updatedAt = Date.now();
  await env.CUTPILOT_DB.prepare(
    `INSERT INTO user_data (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
  ).bind(user.id, data, updatedAt).run();
  return json({ ok: true, updated_at: updatedAt });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PUT") return onRequestPut(context);
  return json({ ok: false, error: "method not allowed" }, 405);
}
