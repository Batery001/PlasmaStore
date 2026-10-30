import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizePhoneCl,
  normalizeTuuAccountId,
  normalizeTuuMode,
  resolveTuuCredentials,
  signTuuParams,
  signaturesMatch,
  TEST_ACCOUNT_ID,
  TEST_SECRET,
  tuuResultApproved,
  tuuResultFailed,
} from "../src/tuuCheckout.mjs";

describe("tuuCheckout", () => {
  it("firma HMAC estable y ordenada", () => {
    const a = signTuuParams({ x_b: "2", x_a: "1", x_signature: "ignore" }, "secret");
    const b = signTuuParams({ x_a: "1", x_b: "2" }, "secret");
    assert.equal(a, b);
    assert.equal(a.length, 64);
    assert.equal(signaturesMatch(a, b), true);
    assert.equal(signaturesMatch(a, "nope"), false);
  });

  it("normaliza modo y account_id", () => {
    assert.equal(normalizeTuuMode("producción"), "production");
    assert.equal(normalizeTuuMode("dev"), "integration");
    assert.equal(normalizeTuuAccountId("12.345.678-9"), "123456789");
  });

  it("teléfono CL", () => {
    assert.equal(normalizePhoneCl("912345678"), "+56912345678");
    assert.equal(normalizePhoneCl("+56 9 1234 5678"), "+56912345678");
  });

  it("resultados de pago", () => {
    assert.equal(tuuResultApproved("completed"), true);
    assert.equal(tuuResultFailed("failed"), true);
    assert.equal(tuuResultApproved("pending"), false);
  });

  it("credenciales: live en integración → error", () => {
    const r = resolveTuuCredentials({
      tuu_enabled: true,
      tuu_mode: "integration",
      tuu_account_id: "99999999",
      tuu_secret: "realSecretNotTest",
    });
    assert.ok(r.error);
    assert.match(String(r.error), /Producción/i);
  });

  it("credenciales: integración vacía usa test", () => {
    const r = resolveTuuCredentials({
      tuu_enabled: true,
      tuu_mode: "integration",
      tuu_account_id: "",
      tuu_secret: "",
    });
    assert.equal(r.usingTest, true);
    assert.equal(r.accountId, TEST_ACCOUNT_ID);
    assert.equal(r.secret, TEST_SECRET);
    assert.equal(r.error, null);
  });
});
