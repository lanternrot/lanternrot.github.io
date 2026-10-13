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

const joined = segments => segments.map(segment => segment.text).join("");

test("when the latest post is that version's release, the chip says it is out", () => {
  const segments = chipSegments("4.9.0", "Dorf 4.9.0: rivals in the Echoing Caverns");
  assert.equal(joined(segments), "Dorf 4.9.0 is out · Rivals in the Echoing Caverns");
});

test("only the version itself is the styled segment", () => {
  assert.deepEqual(chipSegments("4.9.0", "Dorf 4.9.0: rivals in the Echoing Caverns"), [
    { text: "Dorf 4.9.0", version: true },
    { text: " is out · Rivals in the Echoing Caverns" },
  ]);
});

test("a title that is already capitalised after the colon stays as it is", () => {
  assert.equal(joined(chipSegments("4.8.0", "Dorf 4.8.0: The Ancient Catacombs, rebuilt")), "Dorf 4.8.0 is out · The Ancient Catacombs, rebuilt");
});

test("when the latest post is about another version, it is shown as the latest post", () => {
  const segments = chipSegments("4.10.0", "Dorf 4.9.0: rivals in the Echoing Caverns");
  assert.equal(joined(segments), "Dorf 4.10.0 · Latest: Dorf 4.9.0: rivals in the Echoing Caverns");
  assert.deepEqual(segments[0], { text: "Dorf 4.10.0", version: true });
});

test("when the latest post is about something else, it is shown as the latest post", () => {
  assert.equal(joined(chipSegments("4.9.0", "Lantern Rot opens its doors")), "Dorf 4.9.0 · Latest: Lantern Rot opens its doors");
});

test("a longer version number is not a match", () => {
  assert.equal(joined(chipSegments("4.9.0", "Dorf 4.9.01: odd")), "Dorf 4.9.0 · Latest: Dorf 4.9.01: odd");
  assert.equal(joined(chipSegments("4.9", "Dorf 4.9.0: rivals")), "Dorf 4.9 · Latest: Dorf 4.9.0: rivals");
});

test("a title with nothing after the colon is not a release headline", () => {
  assert.equal(joined(chipSegments("4.9.0", "Dorf 4.9.0:")), "Dorf 4.9.0 · Latest: Dorf 4.9.0:");
  assert.equal(joined(chipSegments("4.9.0", "Dorf 4.9.0:   ")), "Dorf 4.9.0 · Latest: Dorf 4.9.0:   ");
});

test("without a version the chip is just the latest post", () => {
  assert.deepEqual(chipSegments(null, "Rivals"), [{ text: "Latest: Rivals" }]);
});
