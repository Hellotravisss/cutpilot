import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentUser } from "../functions/_shared/auth.js";
import { onRequestGet, onRequestPut } from "../functions/api/user-data.js";

const accountQueries = [];
const productQueries = [];
const row = { user_id: "user-1", email: "test@example.com", lang: "zh", expires_at: Date.now() + 60_000 };
const stored = new Map();
const statement = (queries, sql, isAccount) => ({
  bind(...values) { this.values = values; return this; },
  async first() {
    queries.push(sql);
    if (isAccount) return row;
    const value = stored.get(this.values[0]);
    return value || null;
  },
  async run() {
    queries.push(sql);
    stored.set(this.values[0], { data: this.values[1], updated_at: this.values[2] });
    return { success: true };
  },
});
const env = {
  ACCOUNTS_DB: { prepare: (sql) => statement(accountQueries, sql, true) },
  CUTPILOT_DB: { prepare: (sql) => statement(productQueries, sql, false) },
};
const request = (method = "GET", body) => new Request("https://cutpilot.lowbattery.studio/api/user-data", {
  method,
  headers: { Cookie: "other=1; lbs_session=abcdef123456", ...(body ? { "Content-Type": "application/json" } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

assert.equal((await currentUser(env, request())).id, "user-1");
let response = await onRequestGet({ env, request: request() });
assert.equal(response.status, 200);
assert.equal((await response.json()).data.preferredHost, "codex");
response = await onRequestPut({ env, request: request("PUT", { preferredHost: "claude" }) });
assert.equal(response.status, 200);
response = await onRequestGet({ env, request: request() });
assert.equal((await response.json()).data.preferredHost, "claude");
assert.ok(accountQueries.every((sql) => /^SELECT\s/i.test(sql.trim())), "ACCOUNTS_DB must only receive SELECT queries");
assert.ok(productQueries.some((sql) => /INSERT INTO user_data/.test(sql)));

const authSource = readFileSync("site/auth.js", "utf8");
assert.match(authSource, /https:\/\/accounts\.lowbattery\.studio/);
assert.match(authSource, /credentials:\s*"include"/);
assert.match(authSource, /lbs_login/);
assert.doesNotMatch(authSource, /document\.cookie|Set-Cookie|password/i);
assert.match(readFileSync("site/index.html", "utf8"), /auth\.js/);
console.log(JSON.stringify({ ok: true, accountQueries: accountQueries.length, productQueries: productQueries.length }));
