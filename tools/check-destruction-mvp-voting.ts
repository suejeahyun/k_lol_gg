import assert from "node:assert/strict";
import { resolveMvpVotes } from "../src/lib/destruction/mvp-voting";

assert.deepEqual(resolveMvpVotes([1, 1, 1, 2, 2, 3, 3, 4, 4]), {
  status: "PENDING",
  voteCount: 9,
});

assert.deepEqual(resolveMvpVotes([1, 1, 1, 1, 2, 2, 2, 3, 3, 4]), {
  status: "FINALIZED",
  mvpPlayerId: 1,
  voteCount: 10,
});

assert.deepEqual(resolveMvpVotes([9, 7, 9, 7, 9, 7, 9, 7, 3, 4]), {
  status: "REVOTE",
  candidatePlayerIds: [7, 9],
  voteCount: 10,
});

assert.deepEqual(resolveMvpVotes([8, 8, 8, 4, 4, 4, 2, 2, 2, 1]), {
  status: "REVOTE",
  candidatePlayerIds: [2, 4, 8],
  voteCount: 10,
});

console.log("Destruction MVP voting checks passed.");
