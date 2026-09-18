import assert from "node:assert/strict";
import { hashPassword, verifyPassword, isPasswordHashConfigured } from "../lib/auth.js";
import { emptyDimensionStates, applyEvent, computeTrajectory, updateThreshold } from "../lib/engine.js";

const password = "test-passphrase-123";
const stored = await hashPassword(password, 150000);
assert.equal(isPasswordHashConfigured(stored), true);
assert.equal(await verifyPassword(password, stored), true);
assert.equal(await verifyPassword("wrong-passphrase", stored), false);

let states = emptyDimensionStates();
const before = computeTrajectory(states);
({ newStates: states } = applyEvent(states, {
  dimension: "creation", type: "positive", magnitude: 1,
  quality: 1, evidence: 1, significance: 1, persistence: 1, alignment: 1
}));
const after = computeTrajectory(states);
assert(after > before, "positive high-quality event should increase trajectory");
const threshold = updateThreshold(0.6, [0.7, 0.71, 0.72]);
assert(threshold < 0.6 && threshold > 0.59);
console.log("Self-test passed: auth + deterministic scoring + threshold adaptation.");
