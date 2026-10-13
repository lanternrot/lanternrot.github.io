import test from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "../assets/js/logic.js";

test("a form with no key says it isn't connected yet", () => {
  assert.match(errorMessage("not-connected"), /isn't connected yet/);
});

test("every failure kind reassures the visitor that their answers are kept", () => {
  for (const kind of ["not-connected", "network", "http", "bad-response", "rejected"]) {
    assert.match(errorMessage(kind), /answers are still filled in/, kind);
  }
});

test("a service that didn't answer suggests trying again", () => {
  for (const kind of ["network", "http", "bad-response"]) {
    assert.match(errorMessage(kind), /try again/, kind);
  }
});

test("an unknown kind still gets the generic message instead of nothing", () => {
  assert.match(errorMessage("something-new"), /answers are still filled in/);
});
