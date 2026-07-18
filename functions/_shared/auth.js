const COOKIE_NAME = "lbs_session";

export const json = (value, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function currentUser(env, request) {
  const match = (request.headers.get("Cookie") || "").match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([a-f0-9]+)`),
  );
  if (!match) return null;
  const row = await env.ACCOUNTS_DB.prepare(
    `SELECT s.user_id, s.expires_at, u.email, u.lang FROM sessions s
     JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
  ).bind(match[1]).first();
  if (!row || Date.now() > row.expires_at) return null;
  return { id: row.user_id, email: row.email, lang: row.lang };
}
