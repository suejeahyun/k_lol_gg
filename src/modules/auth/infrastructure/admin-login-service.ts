import "server-only";

import { authenticateAdmin, type AdminLoginInput } from "../application/authenticate-admin";
import { getFixtureAuthAccountRepository } from "./fixture-auth-repository";
import { NodePasswordVerifier } from "./node-password";
import { Rfc6238TotpVerifier } from "./totp";

export async function authenticateAdminFromRuntime(input: AdminLoginInput) {
  const accounts = await getFixtureAuthAccountRepository();
  if (!accounts) return null;

  return authenticateAdmin(input, {
    accounts,
    passwords: new NodePasswordVerifier(),
    totp: new Rfc6238TotpVerifier(),
  });
}
