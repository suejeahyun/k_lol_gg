import assert from "node:assert/strict";
import test from "node:test";
import type { AuthAccount } from "../src/modules/auth/domain/auth-account";
import { authenticateAdmin } from "../src/modules/auth/application/authenticate-admin";
import { hashPassword, NodePasswordVerifier } from "../src/modules/auth/infrastructure/node-password";

const password = "synthetic-password-123!";
async function account(patch: Partial<AuthAccount> = {}): Promise<AuthAccount> {
  return { id: "fixture-admin", loginId: "e2e_admin", passwordHash: await hashPassword(password), role: "ADMIN", status: "APPROVED", authVersion: 1, revision: 0, mustChangePassword: false, passwordChangedAt: null, statusChangedAt: new Date(0), statusReasonPublic: null, adminTotpEnabled: false, adminTotpSecret: null, ...patch };
}
function dependencies(value: AuthAccount) {
  return { accounts: { source: "fixture" as const, findByLoginId: async (id: string) => id === value.loginId ? value : null, findById: async () => value, consumeTotpStep: async () => { throw new Error("Password login must not consume TOTP"); } }, passwords: new NodePasswordVerifier() };
}
test("approved administrators log in using only a password, regardless of legacy TOTP enrollment or keys", async () => {
  for (const legacy of [false, true]) {
    const value = await account({ adminTotpEnabled: legacy, adminTotpSecretUnavailable: legacy });
    const deps = dependencies(value);
    assert.deepEqual(await authenticateAdmin({ loginId: value.loginId, password: "wrong" }, deps), { type: "invalid-credentials" });
    for (const totpCode of [undefined, "123456", "123456"]) {
      const result = await authenticateAdmin({ loginId: value.loginId, password, totpCode }, deps);
      assert.equal(result.type, "authenticated");
      if (result.type === "authenticated") {
        assert.equal(result.requiresTwoFactorSetup, false);
        assert.equal(result.session.adminTotpVerified, false);
        assert.equal(result.session.purpose, "ADMIN");
      }
    }
  }
});
test("administrator password login still rejects user roles, unapproved accounts and temporary passwords", async () => {
  for (const [patch, reason] of [[{ role: "USER" }, "ROLE"], [{ status: "PENDING" }, "STATUS"], [{ status: "SUSPENDED" }, "STATUS"], [{ mustChangePassword: true }, "PASSWORD_CHANGE"]] as const) {
    const value = await account(patch);
    assert.deepEqual(await authenticateAdmin({ loginId: value.loginId, password }, dependencies(value)), { type: "forbidden", reason });
  }
  const value = await account({ role: "SUPER_ADMIN" });
  assert.equal((await authenticateAdmin({ loginId: value.loginId, password }, dependencies(value))).type, "authenticated");
});
test("login input rejects control characters and invalid legacy OTP fields", async () => {
  const value = await account(), deps = dependencies(value);
  for (const input of [{ loginId: `${value.loginId}\u061c`, password }, { loginId: value.loginId, password: "synthetic\u200e-password-123!" }, { loginId: value.loginId, password, totpCode: "123 456" }]) assert.deepEqual(await authenticateAdmin(input, deps), { type: "invalid-input" });
});
