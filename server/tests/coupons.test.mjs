import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCouponCode, validateCoupon } from "../src/coupons.mjs";

function mockDb(row) {
  return {
    collection() {
      return {
        async findOne() {
          return row;
        },
      };
    },
  };
}

describe("coupons", () => {
  it("normaliza código", () => {
    assert.equal(normalizeCouponCode("  hola 10 "), "HOLA10");
  });

  it("valida percent y fixed", async () => {
    const pct = await validateCoupon(
      mockDb({ code: "DESC10", type: "percent", value: 10, active: true }),
      "desc10",
      10000
    );
    assert.equal(pct.ok, true);
    assert.equal(pct.discount_cents, 1000);

    const fixed = await validateCoupon(
      mockDb({ code: "PLASMA2K", type: "fixed", value: 2000, active: true }),
      "plasma2k",
      5000
    );
    assert.equal(fixed.ok, true);
    assert.equal(fixed.discount_cents, 2000);
  });

  it("rechaza inexistente", async () => {
    const bad = await validateCoupon(mockDb(null), "NOPE", 1000);
    assert.equal(bad.ok, false);
  });
});
