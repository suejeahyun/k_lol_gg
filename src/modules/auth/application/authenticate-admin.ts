import type { AuthAccountRepository } from "./ports/auth-account-repository";
import type { PasswordVerifier } from "./ports/password-verifier";
import { isAdminRole, type AuthSessionSeed } from "../domain/auth-session";
import { containsUnsafeText } from "@/platform/security/input-safety";

export type AdminLoginInput = {
  loginId: string;
  password: string;
  totpCode?: string;
};

export type AdminLoginResult =
  | { type: "authenticated"; session: AuthSessionSeed; requiresTwoFactorSetup: boolean }
  | { type: "invalid-credentials" }
  | {
      type: "forbidden";
      reason: "PASSWORD_CHANGE" | "ROLE" | "STATUS";
    }
  | { type: "invalid-input" };

type AuthenticateAdminDependencies = {
  accounts: AuthAccountRepository;
  passwords: PasswordVerifier;
};

export async function authenticateAdmin(
  rawInput: AdminLoginInput,
  dependencies: AuthenticateAdminDependencies,
): Promise<AdminLoginResult> {
  if (
    typeof rawInput.loginId !== "string" ||
    typeof rawInput.password !== "string" ||
    (rawInput.totpCode !== undefined && typeof rawInput.totpCode !== "string")
  ) {
    return { type: "invalid-input" };
  }
  const rawLoginId = rawInput.loginId;
  const password = rawInput.password;
  const rawTotpCode = rawInput.totpCode ?? "";
  const loginId = rawLoginId.trim();
  const totpCode = rawTotpCode.trim();

  if (
    !loginId ||
    !password ||
    loginId.length > 128 ||
    password.length > 256 ||
    containsUnsafeText(rawLoginId) ||
    containsUnsafeText(password) ||
    containsUnsafeText(rawTotpCode) ||
    (totpCode.length > 0 && !/^\d{6}$/.test(totpCode))
  ) {
    return { type: "invalid-input" };
  }

  const account = await dependencies.accounts.findByLoginId(loginId);
  const passwordMatches = await dependencies.passwords.verify(password, account?.passwordHash ?? null);

  if (!account || !passwordMatches) {
    return { type: "invalid-credentials" };
  }

  if (!isAdminRole(account.role)) {
    return { type: "forbidden", reason: "ROLE" };
  }

  if (account.status !== "APPROVED") {
    return { type: "forbidden", reason: "STATUS" };
  }

  if (account.mustChangePassword) {
    return { type: "forbidden", reason: "PASSWORD_CHANGE" };
  }

  return {
    type: "authenticated",
    requiresTwoFactorSetup: false,
    session: {
      userId: account.id,
      role: account.role,
      purpose: "ADMIN",
      accountStatus: account.status,
      mustChangePassword: account.mustChangePassword,
      authVersion: account.authVersion,
      adminTotpVerified: false,
      source: dependencies.accounts.source,
    },
  };
}
