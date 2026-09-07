import assert from "node:assert/strict";
import test from "node:test";

import {
  moveSelectableIndex,
  resolveSelectableIndex,
} from "../src/app/(admin)/admin/matches/bounded-picker-navigation";

test("picker keyboard navigation skips inactive and duplicate-disabled rows", () => {
  const selectable = [1, 4, 7];
  assert.equal(resolveSelectableIndex(selectable, 0), 1);
  assert.equal(moveSelectableIndex(selectable, 1, 1), 4);
  assert.equal(moveSelectableIndex(selectable, 4, 1), 7);
  assert.equal(moveSelectableIndex(selectable, 7, 1), 7);
  assert.equal(moveSelectableIndex(selectable, 7, -1), 4);
  assert.equal(moveSelectableIndex(selectable, 0, -1), 1);
  assert.equal(moveSelectableIndex([], 0, 1), -1);
});
