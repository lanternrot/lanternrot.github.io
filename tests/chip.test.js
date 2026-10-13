import test from "node:test";
import assert from "node:assert/strict";
import { parseVersion, chipSegments } from "../assets/js/logic.js";

test("accepts plain and prerelease semver, ignoring surrounding whitespace", () => {
  assert.equal(parseVersion("4.9.0"), "4.9.0");
  assert.equal(parseVersion("4.9.0\n"), "4.9.0");
  assert.equal(parseVersion("  10.0.12 \r\n"), "10.0.12");
  assert.equal(parseVersion("1.2.3-beta.1"), "1.2.3-beta.1");
});

test("a leading v is dropped so the chip never reads 'Dorf v4.9.0'", () => {
  assert.equal(parseVersion("v4.9.0"), "4.9.0");
});

test("rejects anything that isn't a version", () => {
  const junk = ["", "   ", "404: Not Found", "<html><body>hi</body></html>", "4.9", "latest", "4.9.0\n5.0.0", "4.9.x", "1".repeat(40) + ".0.0"];
  for (const text of junk) {
    assert.equal(parseVersion(text), null, JSON.stringify(text));
  }
});

test("rejects non-strings", () => {
  assert.equal(parseVersion(undefined), null);
  assert.equal(parseVersion(null), null);
  assert.equal(parseVersion(490), null);
});

test("with a version the chip leads with Dorf and the version", () => {
  assert.deepEqual(chipSegments("4.9.0", "Dorf 4.9.0: rivals"), [
    { text: "Dorf 4.9.0 · ", version: true },
    { text: "Latest: Dorf 4.9.0: rivals" },
  ]);
});

test("without a version the chip is just the latest post", () => {
  assert.deepEqual(chipSegments(null, "Rivals"), [{ text: "Latest: Rivals" }]);
});
