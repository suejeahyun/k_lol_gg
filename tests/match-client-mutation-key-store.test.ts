import assert from "node:assert/strict";
import test from "node:test";

import { ClientMatchMutationKeyStore } from "../src/modules/matches/infrastructure/client-match-mutation-key-store";

test("match client retries preserve one key for exact body and revision", () => {
  let serial = 0;
  const store = new ClientMatchMutationKeyStore("fixture", () => `key-${++serial}`);
  const first = store.issue("UPLOAD:game-1", 2, { sha256: "abc", size: 12 });
  const retry = store.issue("UPLOAD:game-1", 2, { size: 12, sha256: "abc" });
  const newRevision = store.issue("UPLOAD:game-1", 3, { sha256: "abc", size: 12 });
  const newBody = store.issue("UPLOAD:game-1", 2, { sha256: "def", size: 12 });
  assert.equal(retry.key, first.key);
  assert.notEqual(newRevision.key, first.key);
  assert.notEqual(newBody.key, first.key);
  store.complete(first);
  assert.notEqual(store.issue("UPLOAD:game-1", 2, { sha256: "abc", size: 12 }).key, first.key);
});
