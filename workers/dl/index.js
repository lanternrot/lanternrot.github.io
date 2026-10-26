// dl.lanternrot.com: the one address phones and links ask for each download.
// It sends every request on to wherever that file lives today, so moving a file
// means changing PLACES and redeploying, never shipping a new build.

export const PLACES = {
  "/dorf/dorf.apk": "https://github.com/Deltran/dorf/releases/latest/download/dorf.apk",
  "/dorf/web-manifest.json": "https://raw.githubusercontent.com/Deltran/dorf/main/web-manifest.json",
  "/dorf/changelog.txt": "https://raw.githubusercontent.com/Deltran/dorf/main/changelog.txt",
};

export default {
  async fetch(request) {
    const place = PLACES[new URL(request.url).pathname];
    if (!place) return new Response("Not found\n", { status: 404 });
    return new Response(null, { status: 302, headers: { Location: place } });
  },
};
