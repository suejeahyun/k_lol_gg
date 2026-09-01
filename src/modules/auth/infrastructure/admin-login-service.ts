import "server-only";

import { authenticateAdmin, type AdminLoginInput } from "../application/authenticate-admin";
import { DatabaseAuthAccountRepository } from "./database-auth-account-repository";
import { getFixtureAuthAccountRepository } from "./fixture-auth-repository";
import { NodePasswordVerifier } from "./node-password";
import { resolveRuntimeAuthContext } from "./runtime-auth-context";
import { Rfc6238TotpVerifier } from "./totp";

export async function authenticateAdminFromRuntime(input: AdminLoginInput) {
  const context = resolveRuntimeAuthContext();
  if (!context) return null;

  try {
    const accounts = context.mode === "fixture"
      ? await getFixtureAuthAccountRepository()
      : new DatabaseAuthAccountRepository(context.repository, context.totpKeys);
    if (!accounts) return null;

    return await authenticateAdmin(input, {
      accounts,
      passwords: new NodePasswordVerifier(),
      totp: new Rfc6238TotpVerifier(),
    });
  } catch {
    return null;
  }
}
