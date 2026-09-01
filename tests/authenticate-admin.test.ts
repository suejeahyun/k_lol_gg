import assert from "node:assert/strict";
import test from "node:test";
import type { AuthAccount } from "../src/modules/auth/domain/auth-account";
import type { AuthAccountRepository } from "../src/modules/auth/application/ports/auth-account-repository";
import { authenticateAdmin } from "../src/modules/auth/application/authenticate-admin";
import { hashPassword, NodePasswordVerifier } from "../src/modules/auth/infrastructure/node-password";
import { generateTotpCode, Rfc6238TotpVerifier } from "../src/modules/auth/infrastructure/totp";

function base32Encode(value: Buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...value].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    result += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

const SECRET = base32Encode(Buffer.from("12345678901234567890"));
const NOW = 59_000;

class MemoryAccountRepository implements AuthAccountRepository {
  private consumedStep: number | undefined;

  constructor(private readonly account: AuthAccount) {}

  async findByLoginId(loginId: string) {
    return loginId === this.account.loginId ? this.account : null;
  }

  async findById(accountId: string) {
    return accountId === this.account.id ? this.account : null;
  }

  async consumeTotpStep(_accountId: string, step: number) {
    if (this.consumedStep !== undefined && step <= this.consumedStep) return false;
    this.consumedStep = step;
    return true;
  }
}

test("admin login requires password, TOTP, and rejects code replay", async () => {
  const account: AuthAccount = {
    id: "fixture-admin",
    loginId: "e2e_admin",
    passwordHash: await hashPassword("synthetic-password-123!"),
    role: "ADMIN",
    status: "APPROVED",
    authVersion: 1,
    adminTotpEnabled: true,
    adminTotpSecret: SECRET,
  };
  const dependencies = {
    accounts: new MemoryAccountRepository(account),
    passwords: new NodePasswordVerifier(),
    totp: new Rfc6238TotpVerifier(() => NOW, 0),
  };

  assert.deepEqual(await authenticateAdmin({
    loginId: account.loginId,
    password: "wrong-password",
  }, dependencies), { type: "invalid-credentials" });

  assert.deepEqual(await authenticateAdmin({
    loginId: account.loginId,
    password: "synthetic-password-123!",
  }, dependencies), { type: "two-factor-required" });

  const totpCode = generateTotpCode(SECRET, 1);
  const authenticated = await authenticateAdmin({
    loginId: account.loginId,
    password: "synthetic-password-123!",
    totpCode,
  }, dependencies);
  assert.equal(authenticated.type, "authenticated");

  assert.deepEqual(await authenticateAdmin({
    loginId: account.loginId,
    password: "synthetic-password-123!",
    totpCode,
  }, dependencies), { type: "forbidden", reason: "TOTP_REPLAY" });
});

test("non-admin and pending accounts cannot obtain an admin session", async () => {
  const base: AuthAccount = {
    id: "fixture-user",
    loginId: "e2e_user",
    passwordHash: await hashPassword("synthetic-password-123!"),
    role: "USER",
    status: "APPROVED",
    authVersion: 1,
    adminTotpEnabled: false,
    adminTotpSecret: null,
  };
  const passwords = new NodePasswordVerifier();
  const totp = new Rfc6238TotpVerifier(() => NOW, 0);

  assert.deepEqual(await authenticateAdmin({
    loginId: base.loginId,
    password: "synthetic-password-123!",
  }, { accounts: new MemoryAccountRepository(base), passwords, totp }), {
    type: "forbidden",
    reason: "ROLE",
  });

  const pending = { ...base, role: "ADMIN" as const, status: "PENDING" as const };
  assert.deepEqual(await authenticateAdmin({
    loginId: pending.loginId,
    password: "synthetic-password-123!",
  }, { accounts: new MemoryAccountRepository(pending), passwords, totp }), {
    type: "forbidden",
    reason: "STATUS",
  });
});
