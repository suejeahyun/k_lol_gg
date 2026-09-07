export type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";
export type AccountStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type SessionPurpose = "ACCOUNT" | "ADMIN";
export type LoginRateLimitScope = "LOGIN_ID_HASH" | "IP_HASH" | "GLOBAL_HASH";

export type AuthAccountRecord = Readonly<{
  id: string;
  loginId: string;
  loginIdNormalized: string;
  passwordHash: string | null;
  role: UserRole;
  status: AccountStatus;
  authVersion: number;
  revision: number;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
  statusChangedAt: Date | null;
  statusReasonPublic: string | null;
  deletedAt: Date | null;
}>;

export type ActiveSessionPrincipal = Readonly<{
  sessionId: string;
  userAccountId: string;
  role: UserRole;
  purpose: SessionPurpose;
  accountStatus: AccountStatus;
  mustChangePassword: boolean;
  authVersion: number;
  totpVerifiedAt: Date | null;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type TotpCredentialRecord = Readonly<{
  userAccountId: string;
  secretCiphertext: Buffer;
  secretIv: Buffer;
  secretAuthTag: Buffer;
  keyVersion: number;
  enabledAt: Date | null;
  lastUsedStep: number | null;
}>;

export type LoginRateLimitRecord = Readonly<{
  scope: LoginRateLimitScope;
  attemptCount: number;
  blockedUntil: Date | null;
  expiresAt: Date;
}>;
