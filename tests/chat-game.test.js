import test from "node:test";
import assert from "node:assert/strict";
import { buildChatGamePayload, submitChatGameRequest, SUBMIT_URL } from "../assets/js/logic.js";

const realKey = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"; // gitleaks:allow (fake key for tests)
const answers = { email: "ada@example.com", channel: "twitch.tv/ada", idea: "A garden chat grows", botcheck: false };

// A fetch stand-in that records its calls and replies as told.
function fakeFetch(reply) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (reply instanceof Error) throw reply;
    return { status: reply.status, text: async () => reply.body };
  };
  fn.calls = calls;
  return fn;
}

test("carries the key, a subject that tells it apart from beta requests, and the answers", () => {
  const payload = buildChatGamePayload({ accessKey: realKey, ...answers });
  assert.equal(payload.access_key, realKey);
  assert.equal(payload.subject, "Chat game request");
  assert.equal(payload.from_name, "lanternrot.com");
  assert.equal(payload.email, "ada@example.com");
  assert.equal(payload.channel, "twitch.tv/ada");
  assert.equal(payload.idea, "A garden chat grows");
});

test("trims stray whitespace and keeps a blank idea as an empty string", () => {
  const payload = buildChatGamePayload({
    accessKey: realKey,
    email: "  ada@example.com ",
    channel: " ada\n",
    idea: "  ",
    botcheck: false,
  });
  assert.equal(payload.email, "ada@example.com");
  assert.equal(payload.channel, "ada");
  assert.equal(payload.idea, "");
});

test("a ticked honeypot passes through as botcheck; an unticked one is left out", () => {
  assert.equal(buildChatGamePayload({ accessKey: realKey, ...answers, botcheck: true }).botcheck, true);
  assert.equal("botcheck" in buildChatGamePayload({ accessKey: realKey, ...answers }), false);
});

test("sends no beta fields", () => {
  const payload = buildChatGamePayload({ accessKey: realKey, ...answers });
  for (const key of ["phone", "where", "news", "news_opt_in_at"]) assert.equal(key in payload, false, key);
});

test("the placeholder key never reaches the network and says the form isn't connected", async () => {
  const fetchImpl = fakeFetch({ status: 200, body: '{"success":true}' });
  const result = await submitChatGameRequest({ fetchImpl, accessKey: "PASTE-WEB3FORMS-ACCESS-KEY-HERE", ...answers });
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(result.ok, false);
  assert.equal(result.kind, "not-connected");
  assert.match(result.reason, /placeholder/i);
});

test("posts the chat game payload as JSON to Web3Forms", async () => {
  const fetchImpl = fakeFetch({ status: 200, body: '{"success":true}' });
  const result = await submitChatGameRequest({ fetchImpl, accessKey: realKey, ...answers });
  assert.deepEqual(result, { ok: true });
  assert.equal(fetchImpl.calls.length, 1);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, SUBMIT_URL);
  assert.equal(init.method, "POST");
  assert.match(init.headers["Content-Type"], /application\/json/);
  const sent = JSON.parse(init.body);
  assert.equal(sent.subject, "Chat game request");
  assert.equal(sent.channel, "twitch.tv/ada");
});

test("a rejected reply and a thrown fetch are failures, never a faked success", async () => {
  const no = await submitChatGameRequest({ fetchImpl: fakeFetch({ status: 200, body: '{"success":false,"message":"Nope"}' }), accessKey: realKey, ...answers });
  assert.equal(no.ok, false);
  assert.equal(no.kind, "rejected");
  const down = await submitChatGameRequest({ fetchImpl: fakeFetch(new TypeError("Failed to fetch")), accessKey: realKey, ...answers });
  assert.equal(down.ok, false);
  assert.equal(down.kind, "network");
});
