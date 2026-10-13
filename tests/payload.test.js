import test from "node:test";
import assert from "node:assert/strict";
import { buildPayload } from "../assets/js/logic.js";

const fields = {
  email: "ada@example.com",
  phone: "Pixel 8",
  where: "A stream",
  news: false,
  botcheck: false,
};
const now = new Date("2026-10-13T15:04:05.678Z");
const accessKey = "11111111-2222-3333-4444-555555555555";

test("carries the key, the fixed subject and sender, and the answers", () => {
  const payload = buildPayload({ accessKey, ...fields, now });
  assert.equal(payload.access_key, accessKey);
  assert.equal(payload.subject, "Dorf beta request");
  assert.equal(payload.from_name, "lanternrot.com");
  assert.equal(payload.email, "ada@example.com");
  assert.equal(payload.phone, "Pixel 8");
  assert.equal(payload.where, "A stream");
});

test("news ticked adds news yes and an ISO opt-in timestamp", () => {
  const payload = buildPayload({ accessKey, ...fields, news: true, now });
  assert.equal(payload.news, "yes");
  assert.equal(payload.news_opt_in_at, "2026-10-13T15:04:05.678Z");
});

test("news unticked sends news no and no timestamp at all", () => {
  const payload = buildPayload({ accessKey, ...fields, news: false, now });
  assert.equal(payload.news, "no");
  assert.equal("news_opt_in_at" in payload, false);
});

test("a ticked honeypot passes through as botcheck", () => {
  const payload = buildPayload({ accessKey, ...fields, botcheck: true, now });
  assert.equal(payload.botcheck, true);
});

test("an unticked honeypot is left out, as a native checkbox would be", () => {
  const payload = buildPayload({ accessKey, ...fields, botcheck: false, now });
  assert.equal("botcheck" in payload, false);
});

test("trims stray whitespace from the answers", () => {
  const payload = buildPayload({
    accessKey,
    ...fields,
    email: "  ada@example.com ",
    phone: " Pixel 8\n",
    where: "  ",
    now,
  });
  assert.equal(payload.email, "ada@example.com");
  assert.equal(payload.phone, "Pixel 8");
  assert.equal(payload.where, "");
});
