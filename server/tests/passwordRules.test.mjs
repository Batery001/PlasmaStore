import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPasswordRules, isPasswordStrong, passwordValidationError } from "../src/passwordRules.mjs";

describe("passwordRules", () => {
  it("rechaza contraseñas cortas o sin complejidad", () => {
    assert.equal(isPasswordStrong("abc"), false);
    assert.equal(isPasswordStrong("Password1"), false);
    assert.ok(passwordValidationError("corta"));
  });

  it("acepta contraseña fuerte", () => {
    assert.equal(isPasswordStrong("Clave#2026"), true);
    assert.equal(passwordValidationError("Clave#2026"), null);
    const rules = getPasswordRules("Clave#2026");
    assert.ok(rules.every((r) => r.ok));
  });
});
