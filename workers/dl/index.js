// dl.lanternrot.com: the one address phones and links ask for each download.
// It sends every request on to wherever that file lives today, so moving a file
// means changing PLACES and redeploying, never shipping a new build.

export const PLACES = {
  "/dorf/dorf.apk": "https://github.com/Deltran/dorf/releases/latest/download/dorf.apk",
  "/dorf/web-manifest.json": "https://raw.githubusercontent.com/Deltran/dorf/main/web-manifest.json",
  "/dorf/changelog.txt": "https://raw.githubusercontent.com/Deltran/dorf/main/changelog.txt",
  "/dorf/mail.json": "https://raw.githubusercontent.com/Deltran/dorf/main/mail.json",
};

// The Twitch link service the game talks to (it lives inside stream-control). Moving it is a change to this line.
export const TWITCH_LINK_SERVICE = "https://stream-control-deltran.fly.dev/m/dorf-link/api";
const TWITCH_PREFIX = "/dorf/twitch/";
const TWITCH_METHODS = ["start", "check", "status", "received", "unlink"];

const CORS = { "Access-Control-Allow-Origin": "*" };

// An answer the game can read from inside its web view: every one carries the CORS header.
function answer(body, status, headers = {}) {
  return new Response(body, { status, headers: { ...CORS, ...headers } });
}

async function forwardTwitchCall(request, method) {
  const body = await request.text();
  const reply = await fetch(`${TWITCH_LINK_SERVICE}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  return answer(reply.body, reply.status, { "Content-Type": reply.headers.get("Content-Type") ?? "application/json" });
}

function twitchCall(request, method) {
  if (!TWITCH_METHODS.includes(method)) return answer("Not found\n", 404);
  if (request.method === "OPTIONS") {
    return answer(null, 204, { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" });
  }
  if (request.method !== "POST") return answer("Method not allowed\n", 405, { Allow: "POST, OPTIONS" });
  return forwardTwitchCall(request, method);
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith(TWITCH_PREFIX)) return twitchCall(request, pathname.slice(TWITCH_PREFIX.length));
    const place = PLACES[pathname];
    if (!place) return new Response("Not found\n", { status: 404 });
    // The game fetches from inside its web view, which drops a forward without this header.
    return new Response(null, { status: 302, headers: { Location: place, "Access-Control-Allow-Origin": "*" } });
  },
};
