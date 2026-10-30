import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanRut, formatRut, parseAndValidateRut } from "../src/rut.mjs";

describe("rut", () => {
  it("limpia y formatea", () => {
    assert.equal(cleanRut("12.345.678-5"), "123456785");
    assert.equal(formatRut("123456785"), "12.345.678-5");
  });

  it("valida DV correcto e incorrecto", () => {
    const ok = parseAndValidateRut("11.111.111-1");
    assert.ok(ok);
    assert.equal(ok.clean, "111111111");
    assert.equal(parseAndValidateRut("11.111.111-2"), null);
    assert.equal(parseAndValidateRut(""), null);
  });
});
