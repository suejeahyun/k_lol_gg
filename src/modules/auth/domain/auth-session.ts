export const AUTH_ROLES = ["USER", "ADMIN", "SUPER_ADMIN"] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export type AuthSession = {
  sessionId: string;
  userId: string;
  role: AuthRole;
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

export function isAdminRole(role: AuthRole): role is "ADMIN" | "SUPER_ADMIN" {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}
