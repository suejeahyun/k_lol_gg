import type { AuthRole } from "./auth-session";

export type AuthAccountStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export type AuthAccount = {
  id: string;
  loginId: string;
  passwordHash: string;
  role: AuthRole;
  status: AuthAccountStatus;
  authVersion: number;
  adminTotpEnabled: boolean;
  adminTotpSecret: string | null;
};
