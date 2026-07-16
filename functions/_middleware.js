const PRIMARY_HOST = "cutpilot.lowbattery.studio";
const LEGACY_HOST = "cutpilot.pages.dev";

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname === LEGACY_HOST) {
    url.hostname = PRIMARY_HOST;
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
