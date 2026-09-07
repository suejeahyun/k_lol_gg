export const AUTH_ROLES = ["USER", "ADMIN", "SUPER_ADMIN"] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];
export const AUTH_SESSION_PURPOSES = ["ACCOUNT", "ADMIN"] as const;
export type AuthSessionPurpose = (typeof AUTH_SESSION_PURPOSES)[number];
export const AUTH_ACCOUNT_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;
export type AuthSessionAccountStatus = (typeof AUTH_ACCOUNT_STATUSES)[number];

export type AuthSession = {
  sessionId: string;
  userId: string;
  role: AuthRole;
  purpose: AuthSessionPurpose;
  accountStatus: AuthSessionAccountStatus;
  mustChangePassword: boolean;
  authVersion: number;
  adminTotpVerified: boolean;
  source: "fixture" | "database";
  issuedAt: number;
  expiresAt: number;
};

export type AuthSessionSeed = Omit<AuthSession, "sessionId" | "issuedAt" | "expiresAt">;

export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === "string" && AUTH_ROLES.includes(value as AuthRole);
}

export function isAuthSessionPurpose(value: unknown): value is AuthSessionPurpose {
  return typeof value === "string" && AUTH_SESSION_PURPOSES.includes(value as AuthSessionPurpose);
}

export function isAuthSessionAccountStatus(value: unknown): value is AuthSessionAccountStatus {
  return typeof value === "string" && AUTH_ACCOUNT_STATUSES.includes(value as AuthSessionAccountStatus);
}

export function isAdminRole(role: AuthRole): role is "ADMIN" | "SUPER_ADMIN" {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}
