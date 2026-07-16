import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const CONFIG_PATH = resolve(process.env.CUTPILOT_CONFIG_PATH || `${homedir()}/.cutpilot/settings.json`);
const DEFAULTS = { provider: "openai", endpoint: "https://api.openai.com/v1", model: "gpt-5-mini", apiKey: "" };
const allowedProvider = new Set(["openai", "anthropic", "compatible"]);

export function readAiSettings({ revealSecret = false } = {}) {
  let value = { ...DEFAULTS };
  if (existsSync(CONFIG_PATH)) value = { ...value, ...JSON.parse(readFileSync(CONFIG_PATH, "utf8")) };
  return { ...value, apiKey: revealSecret ? value.apiKey : undefined, hasApiKey: Boolean(value.apiKey), configPath: CONFIG_PATH };
}

export function saveAiSettings(input) {
  const current = readAiSettings({ revealSecret: true });
  const provider = String(input.provider || current.provider);
  if (!allowedProvider.has(provider)) throw new Error("Unsupported AI provider");
  const endpoint = String(input.endpoint || current.endpoint).replace(/\/$/, "");
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) throw new Error("AI endpoint must use HTTPS unless it is local");
  const model = String(input.model || current.model).trim(); if (!model) throw new Error("AI model is required");
  const apiKey = input.apiKey === undefined || input.apiKey === "" ? current.apiKey : String(input.apiKey);
  const value = { provider, endpoint, model, apiKey };
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  const temporary = `${CONFIG_PATH}.${process.pid}.tmp`; writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); renameSync(temporary, CONFIG_PATH); chmodSync(CONFIG_PATH, 0o600);
  return readAiSettings();
}

const extractJson = (text) => { const source = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); const start = source.indexOf("{"), end = source.lastIndexOf("}"); if (start < 0 || end < start) throw new Error("AI response did not contain JSON"); return JSON.parse(source.slice(start, end + 1)); };

export async function callConfiguredAi({ system, user, maxTokens = 1200 } = {}) {
  const settings = readAiSettings({ revealSecret: true });
  if (!settings.apiKey) throw new Error("Configure an AI API key in CutPilot Settings first");
  const headers = { "content-type": "application/json" }; let url, payload;
  if (settings.provider === "anthropic") {
    url = `${settings.endpoint}/v1/messages`; headers["x-api-key"] = settings.apiKey; headers["anthropic-version"] = "2023-06-01";
    payload = { model: settings.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] };
  } else {
    url = `${settings.endpoint}/chat/completions`; headers.authorization = `Bearer ${settings.apiKey}`;
    payload = { model: settings.model, max_tokens: maxTokens, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  }
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
  const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(`AI provider ${response.status}: ${data.error?.message || data.message || "request failed"}`);
  const text = settings.provider === "anthropic" ? data.content?.find((part) => part.type === "text")?.text : data.choices?.[0]?.message?.content;
  return { provider: settings.provider, model: settings.model, data: extractJson(text), usage: data.usage || null };
}

export async function testAiConnection() {
  const result = await callConfiguredAi({ system: "Return JSON only.", user: "Return {\"ok\":true,\"message\":\"CutPilot connected\"}.", maxTokens: 80 });
  return { ok: result.data?.ok === true, provider: result.provider, model: result.model, message: result.data?.message || "Connected" };
}
