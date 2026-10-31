import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || "test-secret-for-unit-tests-only";

const { makeOrderAccessToken, verifyOrderAccessToken } = await import("../src/orderAccessToken.mjs");

describe("orderAccessToken", () => {
  it("firma y verifica boleta", () => {
    const t = makeOrderAccessToken({ orderId: 42, purpose: "boleta", ttlSec: 3600 });
    const v = verifyOrderAccessToken(t, "boleta");
    assert.ok(v);
    assert.equal(v.orderId, 42);
    assert.equal(verifyOrderAccessToken(t, "order_status"), null);
    assert.equal(verifyOrderAccessToken("broken", "boleta"), null);
  });
});
