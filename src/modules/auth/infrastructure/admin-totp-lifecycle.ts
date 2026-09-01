import "server-only";

import type {
  TotpMutationActor,
  TotpSecurityMutationResult,
} from "../application/ports/auth-repository";
import { isAdminRole, type AuthSession } from "../domain/auth-session";
import type { TotpCredentialRecord } from "../domain/auth-records";
import { resolveRuntimeAuthContext } from "./runtime-auth-context";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  fingerprintTotpCredential,
} from "./totp-envelope";
import { generateTotpSecret, Rfc6238TotpVerifier } from "./totp";

export type AdminTotpStatus = "NOT_CONFIGURED" | "SETUP_PENDING" | "ENABLED";

export type AdminTotpStatusResult =
  | Readonly<{ ok: true; status: AdminTotpStatus }>
  | Readonly<{ ok: false; reason: "FORBIDDEN" | "UNAVAILABLE" }>;

export type AdminTotpSetupResult =
  | Readonly<{
      ok: true;
      status: "SETUP_PENDING";
      manualSecret: string;
      provisioningUri: string;
    }>
  | Readonly<{
      ok: false;
      reason:
        | "ACCOUNT_NOT_ELIGIBLE"
        | "ALREADY_ENABLED"
        | "FORBIDDEN"
        | "PENDING_SETUP_EXISTS"
        | "SESSION_STALE"
        | "UNAVAILABLE";
    }>;

export type AdminTotpCancelSetupResult =
  | Readonly<{ ok: true; status: "NOT_CONFIGURED"; cancelled: boolean }>
  | Readonly<{
      ok: false;
      reason:
        | "ACCOUNT_NOT_ELIGIBLE"
        | "ALREADY_ENABLED"
        | "FORBIDDEN"
        | "SESSION_STALE"
        | "UNAVAILABLE";
    }>;

export type AdminTotpMutationResult =
  | Readonly<{ ok: true; reauthenticationRequired: true }>
  | Readonly<{
      ok: false;
      reason:
        | "FORBIDDEN"
        | "INVALID_CODE"
        | "UNAVAILABLE"
        | Extract<TotpSecurityMutationResult, { ok: false }>["reason"];
    }>;

function statusOf(credential: TotpCredentialRecord | null): AdminTotpStatus {
  if (!credential) return "NOT_CONFIGURED";
  return credential.enabledAt ? "ENABLED" : "SETUP_PENDING";
}

function mutationActor(session: AuthSession): TotpMutationActor | null {
  if (session.source !== "database" || !isAdminRole(session.role)) return null;
  return {
    userAccountId: session.userId,
    sessionId: session.sessionId,
    role: session.role,
    authVersion: session.authVersion,
  };
}

function provisioningUri(userAccountId: string, secret: string): string {
  const issuer = "K-LOL.GG";
  const label = `${issuer}:관리자-${userAccountId.slice(0, 8)}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}

export async function getAdminTotpStatus(
  session: AuthSession,
): Promise<AdminTotpStatusResult> {
  const actor = mutationActor(session);
  if (!actor) return { ok: false, reason: "FORBIDDEN" };

  const context = resolveRuntimeAuthContext();
  if (!context || context.mode !== "database") {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  try {
    return {
      ok: true,
      status: statusOf(await context.repository.getTotpCredential(actor.userAccountId)),
    };
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
}

export async function beginAdminTotpSetup(
  session: AuthSession,
  requestId: string,
): Promise<AdminTotpSetupResult> {
  const actor = mutationActor(session);
  if (!actor) return { ok: false, reason: "FORBIDDEN" };

  const context = resolveRuntimeAuthContext();
  if (!context || context.mode !== "database") {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  const manualSecret = generateTotpSecret();
  try {
    const envelope = encryptTotpSecret(actor.userAccountId, manualSecret, context.totpKeys);
    const result = await context.repository.beginOwnTotpSetup({
      actor,
      envelope,
      now: new Date(),
      requestId,
    });
    if (!result.ok) return result;

    return {
      ok: true,
      status: "SETUP_PENDING",
      manualSecret,
      provisioningUri: provisioningUri(actor.userAccountId, manualSecret),
    };
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
}

export async function cancelAdminTotpSetup(
  session: AuthSession,
  requestId: string,
): Promise<AdminTotpCancelSetupResult> {
  const actor = mutationActor(session);
  if (!actor) return { ok: false, reason: "FORBIDDEN" };

  const context = resolveRuntimeAuthContext();
  if (!context || context.mode !== "database") {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  try {
    const result = await context.repository.cancelOwnPendingTotpSetup({
      actor,
      now: new Date(),
      requestId,
    });
    return result.ok
      ? { ok: true, status: "NOT_CONFIGURED", cancelled: result.cancelled }
      : result;
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
}

async function verifyCredentialCode(
  session: AuthSession,
  code: string,
): Promise<
  | Readonly<{
      ok: true;
      context: Extract<ReturnType<typeof resolveRuntimeAuthContext>, { mode: "database" }>;
      credential: TotpCredentialRecord;
      step: number;
      actor: TotpMutationActor;
    }>
  | Readonly<{ ok: false; reason: "FORBIDDEN" | "INVALID_CODE" | "UNAVAILABLE" }>
> {
  const actor = mutationActor(session);
  if (!actor) return { ok: false, reason: "FORBIDDEN" };
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "INVALID_CODE" };

  const context = resolveRuntimeAuthContext();
  if (!context || context.mode !== "database") {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  try {
    const credential = await context.repository.getTotpCredential(actor.userAccountId);
    if (!credential) return { ok: false, reason: "INVALID_CODE" };
    const secret = decryptTotpSecret(credential, context.totpKeys);
    const verification = new Rfc6238TotpVerifier().verify(secret, code);
    if (!verification.ok) return { ok: false, reason: "INVALID_CODE" };
    return { ok: true, context, credential, step: verification.step, actor };
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
}

export async function enableAdminTotp(
  session: AuthSession,
  code: string,
  requestId: string,
): Promise<AdminTotpMutationResult> {
  const verification = await verifyCredentialCode(session, code);
  if (!verification.ok) return verification;
  if (verification.credential.enabledAt) {
    return { ok: false, reason: "ALREADY_ENABLED" };
  }

  try {
    const result = await verification.context.repository.enableOwnTotp({
      actor: verification.actor,
      candidateStep: verification.step,
      expectedCredentialFingerprint: fingerprintTotpCredential(verification.credential),
      now: new Date(),
      requestId,
    });
    return result.ok
      ? { ok: true, reauthenticationRequired: true }
      : result;
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
}

export async function disableAdminTotp(
  session: AuthSession,
  code: string,
  requestId: string,
): Promise<AdminTotpMutationResult> {
  if (!session.adminTotpVerified) return { ok: false, reason: "FORBIDDEN" };
  const verification = await verifyCredentialCode(session, code);
  if (!verification.ok) return verification;
  if (!verification.credential.enabledAt) {
    return { ok: false, reason: "SETUP_REQUIRED" };
  }

  try {
    const result = await verification.context.repository.disableOwnTotp({
      actor: verification.actor,
      candidateStep: verification.step,
      expectedCredentialFingerprint: fingerprintTotpCredential(verification.credential),
      now: new Date(),
      requestId,
    });
    return result.ok
      ? { ok: true, reauthenticationRequired: true }
      : result;
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
}
