import type { AuthRole } from "./auth-session";

export type AuthAccountStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export type AuthAccount = {
  id: string;
  loginId: string;
  passwordHash: string | null;
  role: AuthRole;
  status: AuthAccountStatus;
  authVersion: number;
  revision: number;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
  statusChangedAt: Date | null;
  statusReasonPublic: string | null;
  adminTotpEnabled: boolean;
  adminTotpSecret: string | null;
  adminTotpSecretUnavailable?: boolean;
};
