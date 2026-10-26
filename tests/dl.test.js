import test from "node:test";
import assert from "node:assert/strict";
import worker from "../workers/dl/index.js";

// Asks dl.lanternrot.com for a file, the way a phone or a link would.
async function ask(path) {
  const response = await worker.fetch(new Request(`https://dl.lanternrot.com${path}`));
  return { status: response.status, goesTo: response.headers.get("Location") };
}

test("today lanternrot.com sends each Dorf file on to the same GitHub file phones get now", async () => {
  assert.deepEqual(await ask("/dorf/dorf.apk"), {
    status: 302,
    goesTo: "https://github.com/Deltran/dorf/releases/latest/download/dorf.apk",
  });
  assert.deepEqual(await ask("/dorf/web-manifest.json"), {
    status: 302,
    goesTo: "https://raw.githubusercontent.com/Deltran/dorf/main/web-manifest.json",
  });
  assert.deepEqual(await ask("/dorf/changelog.txt"), {
    status: 302,
    goesTo: "https://raw.githubusercontent.com/Deltran/dorf/main/changelog.txt",
  });
});

test("a file lanternrot.com doesn't know gets a plain not found", async () => {
  assert.deepEqual(await ask("/dorf/old-build.apk"), { status: 404, goesTo: null });
  assert.deepEqual(await ask("/"), { status: 404, goesTo: null });
});
