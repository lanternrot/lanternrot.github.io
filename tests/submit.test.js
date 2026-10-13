import test from "node:test";
import assert from "node:assert/strict";
import { submitBeta, SUBMIT_URL } from "../assets/js/logic.js";

const realKey = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"; // gitleaks:allow (fake key for tests)
const answers = { email: "ada@example.com", phone: "Pixel 8", where: "", news: false, botcheck: false };
const now = new Date("2026-10-13T15:04:05.000Z");

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

test("the placeholder key never reaches the network and says the form isn't connected", async () => {
  const fetchImpl = fakeFetch({ status: 200, body: '{"success":true}' });
  const result = await submitBeta({ fetchImpl, accessKey: "PASTE-WEB3FORMS-ACCESS-KEY-HERE", ...answers, now });
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(result.ok, false);
  assert.equal(result.kind, "not-connected");
  assert.match(result.reason, /placeholder/i);
});

test("posts the payload as JSON to Web3Forms", async () => {
  const fetchImpl = fakeFetch({ status: 200, body: '{"success":true}' });
  await submitBeta({ fetchImpl, accessKey: realKey, ...answers, news: true, now });
  assert.equal(fetchImpl.calls.length, 1);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, SUBMIT_URL);
  assert.equal(url, "https://api.web3forms.com/submit");
  assert.equal(init.method, "POST");
  assert.match(init.headers["Content-Type"], /application\/json/);
  const sent = JSON.parse(init.body);
  assert.equal(sent.access_key, realKey);
  assert.equal(sent.news_opt_in_at, "2026-10-13T15:04:05.000Z");
});

test("ok only on a success true reply", async () => {
  const ok = await submitBeta({ fetchImpl: fakeFetch({ status: 200, body: '{"success":true}' }), accessKey: realKey, ...answers, now });
  assert.deepEqual(ok, { ok: true });
  const no = await submitBeta({ fetchImpl: fakeFetch({ status: 200, body: '{"success":false,"message":"Nope"}' }), accessKey: realKey, ...answers, now });
  assert.equal(no.ok, false);
});

test("a thrown fetch (offline, DNS, blocked) is a network failure with the reason", async () => {
  const result = await submitBeta({ fetchImpl: fakeFetch(new TypeError("Failed to fetch")), accessKey: realKey, ...answers, now });
  assert.equal(result.ok, false);
  assert.equal(result.kind, "network");
  assert.match(result.reason, /Failed to fetch/);
});

test("a body that cannot be read is a failure, not a crash", async () => {
  const fetchImpl = async () => ({ status: 200, text: async () => { throw new Error("stream died"); } });
  const result = await submitBeta({ fetchImpl, accessKey: realKey, ...answers, now });
  assert.equal(result.ok, false);
  assert.equal(result.kind, "network");
});
