import type {
  ActiveSessionPrincipal,
  AuthAccountRecord,
  LoginRateLimitRecord,
  LoginRateLimitScope,
  TotpCredentialRecord,
  UserRole,
} from "../../domain/auth-records";

export type CreateSessionInput = Readonly<{
  id: string;
  tokenHash: Uint8Array;
  userAccountId: string;
  authVersion: number;
  role: UserRole;
  totpVerifiedAt: Date | null;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type RecordLoginAttemptInput = Readonly<{
  scope: LoginRateLimitScope;
  keyHash: Uint8Array;
  windowStartedAt: Date;
  now: Date;
  expiresAt: Date;
  blockUntil: Date;
  limit: number;
}>;

export type AuthCleanupInput = Readonly<{
  now: Date;
  revokedBefore: Date;
}>;

export type AuthCleanupResult = Readonly<{
  sessionsDeleted: number;
  rateLimitBucketsDeleted: number;
}>;

export interface AuthRepository {
  readonly source: "database";
  findAccountById(id: string): Promise<AuthAccountRecord | null>;
  findAccountByLoginId(loginId: string): Promise<AuthAccountRecord | null>;
  createSession(input: CreateSessionInput): Promise<boolean>;
  findActiveSession(
    sessionId: string,
    tokenHash: Uint8Array,
    now: Date,
  ): Promise<ActiveSessionPrincipal | null>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<boolean>;
  getTotpCredential(userAccountId: string): Promise<TotpCredentialRecord | null>;
  consumeTotpStep(userAccountId: string, candidateStep: number, now: Date): Promise<boolean>;
  recordLoginAttempt(input: RecordLoginAttemptInput): Promise<LoginRateLimitRecord>;
  cleanupExpiredAuthState(input: AuthCleanupInput): Promise<AuthCleanupResult>;
}
