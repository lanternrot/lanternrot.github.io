import test from "node:test";
import assert from "node:assert/strict";
import { interpretResponse, isPlaceholderKey } from "../assets/js/logic.js";

test("HTTP 200 with success true is ok", () => {
  const result = interpretResponse(200, '{"success":true,"message":"Email sent"}');
  assert.deepEqual(result, { ok: true });
});

test("success false is a rejection that carries Web3Forms' message", () => {
  const result = interpretResponse(200, '{"success":false,"message":"Invalid access key"}');
  assert.equal(result.ok, false);
  assert.equal(result.kind, "rejected");
  assert.match(result.reason, /Invalid access key/);
});

test("success false without a message still explains itself", () => {
  const result = interpretResponse(200, '{"success":false}');
  assert.equal(result.ok, false);
  assert.match(result.reason, /success: false/);
});

test("a non-2xx status fails even if the body claims success", () => {
  const result = interpretResponse(500, '{"success":true}');
  assert.equal(result.ok, false);
  assert.equal(result.kind, "http");
  assert.match(result.reason, /500/);
});

test("a non-2xx reply passes along Web3Forms' message when it sent one", () => {
  const result = interpretResponse(403, '{"success":false,"message":"Invalid access key"}');
  assert.equal(result.kind, "http");
  assert.match(result.reason, /403/);
  assert.match(result.reason, /Invalid access key/);
});

test("429 and 400 are failures too", () => {
  assert.equal(interpretResponse(429, '{"success":false,"message":"Rate limited"}').ok, false);
  assert.equal(interpretResponse(400, "").ok, false);
});

test("a non-JSON body is a failure, not a crash", () => {
  for (const body of ["<html>Bad gateway</html>", "", "null", "42"]) {
    const result = interpretResponse(200, body);
    assert.equal(result.ok, false, `body: ${JSON.stringify(body)}`);
    assert.equal(result.kind, "bad-response");
  }
});

test("success must be exactly true, not merely truthy", () => {
  for (const body of ['{"success":"true"}', '{"success":1}', "{}"]) {
    assert.equal(interpretResponse(200, body).ok, false, body);
  }
});

test("placeholder keys are recognised", () => {
  for (const key of ["", "   ", undefined, null, "PASTE-WEB3FORMS-ACCESS-KEY-HERE", "paste-your-key"]) {
    assert.equal(isPlaceholderKey(key), true, String(key));
  }
});

test("a real-looking key is not a placeholder", () => {
  assert.equal(isPlaceholderKey("0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"), false);
});
