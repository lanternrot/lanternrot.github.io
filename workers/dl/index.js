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

async function forwardTwitchCall(request, method) {
  const body = await request.text();
  return fetch(`${TWITCH_LINK_SERVICE}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith(TWITCH_PREFIX)) return forwardTwitchCall(request, pathname.slice(TWITCH_PREFIX.length));
    const place = PLACES[pathname];
    if (!place) return new Response("Not found\n", { status: 404 });
    // The game fetches from inside its web view, which drops a forward without this header.
    return new Response(null, { status: 302, headers: { Location: place, "Access-Control-Allow-Origin": "*" } });
  },
};
