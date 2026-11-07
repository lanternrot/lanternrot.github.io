import test from "node:test";
import assert from "node:assert/strict";
import worker, { PLACES } from "../workers/dl/index.js";

// Asks dl.lanternrot.com for a file, the way a phone or a link would.
function send(path) {
  return worker.fetch(new Request(`https://dl.lanternrot.com${path}`));
}

async function ask(path) {
  const response = await send(path);
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

test("moving a file is one change to where lanternrot.com points, with no new build", async () => {
  const today = PLACES["/dorf/dorf.apk"];
  PLACES["/dorf/dorf.apk"] = "https://files.lanternrot.com/dorf/dorf.apk";
  try {
    assert.deepEqual(await ask("/dorf/dorf.apk"), { status: 302, goesTo: "https://files.lanternrot.com/dorf/dorf.apk" });
  } finally {
    PLACES["/dorf/dorf.apk"] = today;
  }
});

test("the game can read every forward from inside its web view", async () => {
  for (const path of Object.keys(PLACES)) {
    const response = await send(path);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*", path);
  }
});

test("the mailbox's gifts are sent on to the feed repo's mail.json", async () => {
  assert.deepEqual(await ask("/dorf/mail.json"), {
    status: 302,
    goesTo: "https://raw.githubusercontent.com/Deltran/dorf/main/mail.json",
  });
});

// ---- The Twitch link route: the game's calls on to the link service ----

const SERVICE = "https://stream-control-deltran.fly.dev/m/dorf-link/api";
const METHODS = ["start", "check", "status", "received", "unlink"];

// Stands in for the link service: records each call it gets and answers with `answer`.
// Restored after each test so no other test sees it.
async function withService(answer, run) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return typeof answer === "function" ? answer(url, init) : answer.clone();
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// A limiter that always lets the call through, and records the keys it was asked about.
function openLimiter() {
  const keys = [];
  return { keys, limit: async ({ key }) => (keys.push(key), { success: true }) };
}
const openEnv = () => ({ START_LIMIT: openLimiter(), CALL_LIMIT: openLimiter() });

// The game's call: a POST with a JSON body from inside its web view.
function callTwitch(method, { env = openEnv(), body = '{"a":1}', verb = "POST", ip = "203.0.113.7" } = {}) {
  const request = new Request(`https://dl.lanternrot.com/dorf/twitch/${method}`, {
    method: verb,
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: verb === "POST" ? body : undefined,
  });
  return worker.fetch(request, env);
}

test("each of the game's five Twitch calls goes on to the link service as the same POST", async () => {
  for (const method of METHODS) {
    await withService(Response.json({ ok: true }), async (calls) => {
      await callTwitch(method, { body: '{"phoneKey":"abc"}' });
      assert.equal(calls.length, 1, method);
      assert.equal(calls[0].url, `${SERVICE}/${method}`);
      assert.equal(calls[0].init.method, "POST");
      assert.equal(calls[0].init.headers["Content-Type"], "application/json");
      assert.equal(calls[0].init.body, '{"phoneKey":"abc"}');
    });
  }
});

test("the link service's answer comes back as it is, status and body, readable from the game", async () => {
  await withService(Response.json({ error: "too many codes" }, { status: 409 }), async () => {
    const response = await callTwitch("start");
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "too many codes" });
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  });
});

test("a Twitch method the game doesn't have gets a plain not found, readable from the game", async () => {
  await withService(Response.json({}), async (calls) => {
    const response = await callTwitch("admin");
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(calls.length, 0);
  });
});

test("anything but a POST to a Twitch call is refused, readable from the game", async () => {
  await withService(Response.json({}), async (calls) => {
    for (const verb of ["GET", "PUT", "DELETE"]) {
      const response = await callTwitch("check", { verb });
      assert.equal(response.status, 405, verb);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*", verb);
    }
    assert.equal(calls.length, 0);
  });
});

test("the browser's preflight before a Twitch call is answered with what the game may send", async () => {
  await withService(Response.json({}), async (calls) => {
    const response = await callTwitch("check", { verb: "OPTIONS" });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
    assert.equal(response.headers.get("Access-Control-Allow-Headers"), "Content-Type");
    assert.ok(Number(response.headers.get("Access-Control-Max-Age")) >= 86400);
    assert.equal(calls.length, 0);
  });
});

test("a body far bigger than any of the game's calls is refused before it reaches the service", async () => {
  await withService(Response.json({}), async (calls) => {
    const response = await callTwitch("received", { body: JSON.stringify({ junk: "x".repeat(10000) }) });
    assert.equal(response.status, 413);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(calls.length, 0);
  });
});

test("a link service that can't be reached reads as a 502 the game can see", async () => {
  await withService(() => Promise.reject(new TypeError("fetch failed")), async () => {
    const response = await callTwitch("check");
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  });
});

test("a link service that takes too long reads as a 504, and the call is given a time limit", async () => {
  let signal;
  await withService(
    (url, init) => {
      signal = init.signal;
      return Promise.reject(new DOMException("The operation timed out.", "TimeoutError"));
    },
    async () => {
      const response = await callTwitch("check");
      assert.equal(response.status, 504);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
      assert.ok(signal instanceof AbortSignal);
    },
  );
});
