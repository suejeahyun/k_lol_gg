import assert from "node:assert/strict";
import {
  isInhouseSubmissionOwner,
  legacyInhouseSubmissionOwnerId,
} from "../src/lib/inhouse-result/ownership";

assert.equal(legacyInhouseSubmissionOwnerId({ submittedByUserAccountId: 17 }), 17);
assert.equal(legacyInhouseSubmissionOwnerId({ submittedByUserAccountId: "17" }), 17);
assert.equal(legacyInhouseSubmissionOwnerId({ submittedByUserAccountId: "not-an-id" }), null);
assert.equal(legacyInhouseSubmissionOwnerId({ submittedByUserAccountId: 0 }), null);
assert.equal(legacyInhouseSubmissionOwnerId(null), null);

assert.equal(
  isInhouseSubmissionOwner({ submittedByUserAccountId: 17, parsedData: {} }, 17),
  true,
  "정규 소유자 컬럼이 일치하면 허용해야 합니다.",
);
assert.equal(
  isInhouseSubmissionOwner(
    { submittedByUserAccountId: 18, parsedData: { submittedByUserAccountId: 17 } },
    17,
  ),
  false,
  "정규 소유자가 있으면 충돌하는 레거시 JSON으로 우회할 수 없어야 합니다.",
);
assert.equal(
  isInhouseSubmissionOwner(
    { submittedByUserAccountId: null, parsedData: { submittedByUserAccountId: 17 } },
    17,
  ),
  true,
  "정규 소유자가 없는 기존 접수만 레거시 JSON fallback을 허용해야 합니다.",
);

console.log("Inhouse submission ownership checks passed.");
