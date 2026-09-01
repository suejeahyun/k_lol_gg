import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ADMIN_SECURITY_PROBLEMS, readTotpCodeRequest } from "@/modules/auth/application/admin-security-http-contract";
import { disableAdminTotp } from "@/modules/auth/infrastructure/admin-totp-lifecycle";
import {
  adminSecurityLifecycleProblem,
  adminSecurityReauthenticationSuccess,
  adminSecurityTraceId,
  readAdminSecurityJson,
  rejectCrossOriginAdminSecurityMutation,
  requireAdminSecuritySession,
} from "@/modules/auth/infrastructure/admin-security-http";
import { problemResponse } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const originRejection = rejectCrossOriginAdminSecurityMutation(request);
  if (originRejection) return originRejection;

  const authorization = await requireAdminSecuritySession(request, {
    requireVerifiedTotp: true,
  });
  if (!authorization.ok) return authorization.response;

  const body = await readAdminSecurityJson(request);
  if (!body.ok) return body.response;
  const code = readTotpCodeRequest(body.value);
  if (!code) {
    return problemResponse(ADMIN_SECURITY_PROBLEMS.invalidPayload, {
      traceId: adminSecurityTraceId(request),
    });
  }

  const result = await disableAdminTotp(authorization.session, code, randomUUID());
  return result.ok
    ? adminSecurityReauthenticationSuccess(request, {
        success: true,
        reauthenticationRequired: true,
      })
    : adminSecurityLifecycleProblem(request, result.reason);
}
