import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRestockTransition } from "../src/wishlist.mjs";

describe("wishlist restock", () => {
  it("detecta 0 → positivo", () => {
    assert.equal(isRestockTransition(0, 1), true);
    assert.equal(isRestockTransition(0, 5), true);
  });
  it("ignora otros cambios", () => {
    assert.equal(isRestockTransition(1, 2), false);
    assert.equal(isRestockTransition(3, 0), false);
    assert.equal(isRestockTransition(0, 0), false);
    assert.equal(isRestockTransition(2, 1), false);
  });
});
