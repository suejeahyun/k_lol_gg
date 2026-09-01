import "server-only";

import type { AuthAccount, AuthAccountStatus } from "../domain/auth-account";
import { isAuthRole } from "../domain/auth-session";
import type { AuthAccountRepository } from "../application/ports/auth-account-repository";
import { hashPassword } from "./node-password";

type RawFixture = {
  id?: unknown;
  loginId?: unknown;
  password?: unknown;
  role?: unknown;
  status?: unknown;
  authVersion?: unknown;
  adminTotpEnabled?: unknown;
  adminTotpSecret?: unknown;
};

const VALID_STATUSES = new Set<AuthAccountStatus>(["PENDING", "APPROVED", "SUSPENDED"]);

function fixtureRuntimeEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.V2_TEST_AUTH_ENABLED === "true";
}

function parseFixture(raw: RawFixture, index: number) {
  const id = String(raw.id ?? "").trim();
  const loginId = String(raw.loginId ?? "").trim();
  const password = String(raw.password ?? "");
  const role = raw.role;
  const status = raw.status;
  const authVersion = Number(raw.authVersion ?? 1);
  const adminTotpEnabled = raw.adminTotpEnabled === true;
  const adminTotpSecret = raw.adminTotpSecret == null ? null : String(raw.adminTotpSecret);

  if (!/^[a-z0-9_-]{3,64}$/i.test(id) || !/^[a-z0-9_-]{3,64}$/i.test(loginId)) {
    throw new Error(`Invalid fixture identifier at index ${index}.`);
  }
  if (password.length < 12 || password.length > 256) {
    throw new Error(`Invalid fixture password length at index ${index}.`);
  }
  if (!isAuthRole(role) || typeof status !== "string" || !VALID_STATUSES.has(status as AuthAccountStatus)) {
    throw new Error(`Invalid fixture role or status at index ${index}.`);
  }
  if (!Number.isInteger(authVersion) || authVersion < 0) {
    throw new Error(`Invalid fixture authVersion at index ${index}.`);
  }
  if (adminTotpEnabled && (!adminTotpSecret || adminTotpSecret.length < 16)) {
    throw new Error(`Enabled fixture TOTP requires a secret at index ${index}.`);
  }

  return { id, loginId, password, role, status: status as AuthAccountStatus, authVersion, adminTotpEnabled, adminTotpSecret };
}

export class FixtureAuthAccountRepository implements AuthAccountRepository {
  private readonly accountsByLoginId: Map<string, AuthAccount>;
  private readonly consumedTotpSteps = new Map<string, number>();

  private constructor(accounts: AuthAccount[]) {
    this.accountsByLoginId = new Map(accounts.map((account) => [account.loginId, account]));
  }

  static async fromEnvironment(): Promise<FixtureAuthAccountRepository | null> {
    if (!fixtureRuntimeEnabled()) return null;

    const source = process.env.V2_TEST_AUTH_FIXTURES_JSON;
    if (!source || source.length > 16_384) {
      throw new Error("V2_TEST_AUTH_FIXTURES_JSON is required and must be at most 16 KiB.");
    }

    const parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 12) {
      throw new Error("V2_TEST_AUTH_FIXTURES_JSON must contain 1 to 12 accounts.");
    }

    const seenIds = new Set<string>();
    const seenLogins = new Set<string>();
    const accounts: AuthAccount[] = [];

    for (const [index, candidate] of parsed.entries()) {
      if (!candidate || typeof candidate !== "object") {
        throw new Error(`Invalid fixture at index ${index}.`);
      }
      const fixture = parseFixture(candidate as RawFixture, index);
      if (seenIds.has(fixture.id) || seenLogins.has(fixture.loginId)) {
        throw new Error(`Duplicate fixture identifier at index ${index}.`);
      }
      seenIds.add(fixture.id);
      seenLogins.add(fixture.loginId);
      accounts.push({
        id: fixture.id,
        loginId: fixture.loginId,
        passwordHash: await hashPassword(fixture.password),
        role: fixture.role,
        status: fixture.status,
        authVersion: fixture.authVersion,
        adminTotpEnabled: fixture.adminTotpEnabled,
        adminTotpSecret: fixture.adminTotpSecret,
      });
    }

    return new FixtureAuthAccountRepository(accounts);
  }

  async findByLoginId(loginId: string) {
    return this.accountsByLoginId.get(loginId) ?? null;
  }

  async consumeTotpStep(accountId: string, step: number) {
    const previousStep = this.consumedTotpSteps.get(accountId);
    if (previousStep !== undefined && step <= previousStep) return false;
    this.consumedTotpSteps.set(accountId, step);
    return true;
  }
}

let repositoryPromise: Promise<FixtureAuthAccountRepository | null> | undefined;

export function getFixtureAuthAccountRepository() {
  repositoryPromise ??= FixtureAuthAccountRepository.fromEnvironment();
  return repositoryPromise;
}
