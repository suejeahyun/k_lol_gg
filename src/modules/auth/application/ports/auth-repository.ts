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

export type TotpMutationActor = Readonly<{
  userAccountId: string;
  sessionId: string;
  role: Extract<UserRole, "ADMIN" | "SUPER_ADMIN">;
  authVersion: number;
}>;

export type TotpSecretEnvelope = Readonly<{
  secretCiphertext: Uint8Array;
  secretIv: Uint8Array;
  secretAuthTag: Uint8Array;
  keyVersion: number;
}>;

export type BeginTotpSetupInput = Readonly<{
  actor: TotpMutationActor;
  envelope: TotpSecretEnvelope;
  now: Date;
  requestId: string;
}>;

export type EnableTotpInput = Readonly<{
  actor: TotpMutationActor;
  candidateStep: number;
  expectedCredentialFingerprint: Uint8Array;
  now: Date;
  requestId: string;
}>;

export type DisableTotpInput = EnableTotpInput;

export type CancelPendingTotpSetupInput = Readonly<{
  actor: TotpMutationActor;
  now: Date;
  requestId: string;
}>;

export type TotpSetupResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      reason:
        | "ACCOUNT_NOT_ELIGIBLE"
        | "ALREADY_ENABLED"
        | "PENDING_SETUP_EXISTS"
        | "SESSION_STALE";
    }>;

export type CancelPendingTotpSetupResult =
  | Readonly<{ ok: true; cancelled: boolean }>
  | Readonly<{
      ok: false;
      reason: "ACCOUNT_NOT_ELIGIBLE" | "ALREADY_ENABLED" | "SESSION_STALE";
    }>;

export type TotpSecurityMutationResult =
  | Readonly<{ ok: true; authVersion: number; revokedSessionCount: number }>
  | Readonly<{
      ok: false;
      reason:
        | "ACCOUNT_NOT_ELIGIBLE"
        | "ALREADY_ENABLED"
        | "SETUP_REQUIRED"
        | "SESSION_STALE"
        | "STATE_CHANGED"
        | "TOTP_REPLAY";
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
  beginOwnTotpSetup(input: BeginTotpSetupInput): Promise<TotpSetupResult>;
  cancelOwnPendingTotpSetup(
    input: CancelPendingTotpSetupInput,
  ): Promise<CancelPendingTotpSetupResult>;
  enableOwnTotp(input: EnableTotpInput): Promise<TotpSecurityMutationResult>;
  disableOwnTotp(input: DisableTotpInput): Promise<TotpSecurityMutationResult>;
  recordLoginAttempt(input: RecordLoginAttemptInput): Promise<LoginRateLimitRecord>;
  cleanupExpiredAuthState(input: AuthCleanupInput): Promise<AuthCleanupResult>;
}
