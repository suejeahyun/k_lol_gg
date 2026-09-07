import "server-only";

import { randomUUID } from "node:crypto";
import { authenticateAdmin, type AdminLoginInput } from "../application/authenticate-admin";
import { DatabaseAuthAccountRepository } from "./database-auth-account-repository";
import { getFixtureAuthAccountRepository } from "./fixture-auth-repository";
import { hashPassword, identifyPasswordHash, NodePasswordVerifier } from "./node-password";
import { resolveRuntimeAuthContext } from "./runtime-auth-context";
import { Rfc6238TotpVerifier } from "./totp";

export async function authenticateAdminFromRuntime(input: AdminLoginInput) {
  const context = resolveRuntimeAuthContext();
  if (!context) return null;

  try {
    const legacyAccount = context.mode === "database"
      ? await context.repository.findAccountByLoginId(input.loginId)
      : null;
    const accounts = context.mode === "fixture"
      ? await getFixtureAuthAccountRepository()
      : new DatabaseAuthAccountRepository(context.repository, context.totpKeys);
    if (!accounts) return null;

    const result = await authenticateAdmin(input, {
      accounts,
      passwords: new NodePasswordVerifier(),
      totp: new Rfc6238TotpVerifier(),
    });
    if (
      context.mode === "database" &&
      result.type === "authenticated" &&
      legacyAccount?.id === result.session.userId &&
      legacyAccount.passwordHash &&
      identifyPasswordHash(legacyAccount.passwordHash) === "BCRYPT"
    ) {
      const changedAt = new Date();
      const nextHash = await hashPassword(input.password);
      await context.repository.upgradePasswordHashIfCurrent(
        legacyAccount.id,
        legacyAccount.passwordHash,
        nextHash,
        changedAt,
        randomUUID(),
        legacyAccount.authVersion,
      );
    }
    return result;
  } catch {
    return null;
  }
}
