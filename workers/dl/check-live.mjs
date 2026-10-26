// Checks the live dl.lanternrot.com against the real files: run after a deploy, and before a Dorf release.
// Exits non-zero, naming each failure, if any address phones or links use has stopped answering.
import { PLACES } from "./index.js";

// Addresses built into Dorf APKs from before dl.lanternrot.com. Those phones read them for good.
const OLD_ADDRESSES = [
  "https://github.com/Deltran/dorf/releases/latest/download/dorf.apk",
  "https://raw.githubusercontent.com/Deltran/dorf/main/web-manifest.json",
  "https://raw.githubusercontent.com/Deltran/dorf/main/changelog.txt",
  "https://raw.githubusercontent.com/Deltran/dorf/main/version.txt",
];

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

// A request that can't connect at all (DNS, offline) is a named failure too, and the other checks still run.
async function reach(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    check(false, `${url} could not be reached (${error.cause?.code ?? error.message})`);
    return null;
  }
}

for (const [path, place] of Object.entries(PLACES)) {
  const url = `https://dl.lanternrot.com${path}`;
  const hop = await reach(url, { redirect: "manual" });
  if (!hop) continue;
  check(hop.status === 302 && hop.headers.get("Location") === place, `${url} forwards to ${place} (got ${hop.status} ${hop.headers.get("Location")})`);
  check(hop.headers.get("Access-Control-Allow-Origin") === "*", `${url} is readable from inside the game`);
  // The APK is hundreds of MB: HEAD is enough to see it's there.
  const file = await reach(url, { method: path.endsWith(".apk") ? "HEAD" : "GET" });
  if (!file) continue;
  const bytes = Number(file.headers.get("Content-Length") ?? (await file.arrayBuffer()).byteLength);
  check(file.ok && bytes > 0, `${url} ends at a real file (${file.status}, ${bytes} bytes)`);
}

for (const url of OLD_ADDRESSES) {
  const file = await reach(url, { method: "HEAD" });
  if (file) check(file.ok, `older builds still reach ${url} (${file.status})`);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
