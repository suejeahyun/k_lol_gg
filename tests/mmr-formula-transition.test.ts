import assert from "node:assert/strict";
import test from "node:test";

import { MMR_FORMULA_TRANSITION, MMR_FORMULA_VERSION, mmrFormulaTransitionState } from "../src/modules/mmr/domain/mmr-projection";

test("V2 deterministic formula transition truthfully requires explicit admin recalculation", () => {
  assert.equal(MMR_FORMULA_TRANSITION.targetFormulaVersion, MMR_FORMULA_VERSION);
  assert.equal(MMR_FORMULA_TRANSITION.requiresExplicitAdminRecalculation, true);
  assert.equal(mmrFormulaTransitionState(null), null);
  assert.equal(mmrFormulaTransitionState(MMR_FORMULA_VERSION), null);
  assert.equal(mmrFormulaTransitionState("V1_LEGACY"), "ADMIN_RECALCULATION_REQUIRED");
});
