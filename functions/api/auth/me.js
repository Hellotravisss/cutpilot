import { currentUser, json } from "../../_shared/auth.js";

export async function onRequestGet({ env, request }) {
  const user = await currentUser(env, request);
  if (!user) return json({ ok: false });
  const display = user.email ? user.email.split("@")[0] : user.lang === "en" ? "WeChat user" : "微信用户";
  return json({ ok: true, email: user.email, display, lang: user.lang });
}
