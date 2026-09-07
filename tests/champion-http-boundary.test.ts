import assert from "node:assert/strict";
import test from "node:test";

import type { AuthSession } from "../src/modules/auth/domain/auth-session";
import { prepareChampionMutation } from "../src/modules/champions/infrastructure/champion-http";

const session: AuthSession = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  role: "ADMIN",
  purpose: "ADMIN",
  accountStatus: "APPROVED",
  mustChangePassword: false,
  authVersion: 1,
  adminTotpVerified: true,
  source: "database",
  issuedAt: 1,
  expiresAt: 2,
};

function request(body: unknown, origin = "https://v2.example") {
  return new Request("https://v2.example/api/admin/champions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "champion-key-1234567890",
      "If-Match": '"0"',
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

test("champion HTTP boundary binds exact input, session, revision and idempotency", async () => {
  const previous = process.env.V2_PUBLIC_ORIGIN;
  process.env.V2_PUBLIC_ORIGIN = "https://v2.example";
  try {
    const result = await prepareChampionMutation(request({ key: "Ahri", displayName: "아리" }), session, { type: "CREATE_CHAMPION" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.command.metadata.actorSession.userAccountId, session.userId);
      assert.equal(result.value.command.metadata.actorSession.sessionId, session.sessionId);
      assert.equal(result.value.command.metadata.expectedRevision, 0);
      assert.equal(result.value.command.metadata.idempotency.keyHash.byteLength, 32);
      assert.equal(result.value.command.metadata.idempotency.requestHash.byteLength, 32);
    }
    assert.equal((await prepareChampionMutation(request({ key: "ahri", displayName: "아리", hidden: true }), session, { type: "CREATE_CHAMPION" })).ok, false);
    assert.equal((await prepareChampionMutation(request({ key: "ahri", displayName: "아리" }, "https://evil.example"), session, { type: "CREATE_CHAMPION" })).ok, false);
  } finally {
    if (previous === undefined) delete process.env.V2_PUBLIC_ORIGIN;
    else process.env.V2_PUBLIC_ORIGIN = previous;
  }
});
