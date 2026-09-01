import { randomUUID } from "node:crypto";
import { ADMIN_SECURITY_PROBLEMS, isEmptySecurityRequest } from "@/modules/auth/application/admin-security-http-contract";
import {
  beginAdminTotpSetup,
  cancelAdminTotpSetup,
} from "@/modules/auth/infrastructure/admin-totp-lifecycle";
import {
  adminSecurityLifecycleProblem,
  adminSecuritySuccess,
  adminSecurityTraceId,
  readAdminSecurityJson,
  rejectCrossOriginAdminSecurityMutation,
  requireAdminSecuritySession,
} from "@/modules/auth/infrastructure/admin-security-http";
import { problemResponse } from "@/platform/http";

export const dynamic = "force-dynamic";

async function mutationContext(request: Request) {
  const originRejection = rejectCrossOriginAdminSecurityMutation(request);
  if (originRejection) return { ok: false as const, response: originRejection };

  const authorization = await requireAdminSecuritySession(request);
  if (!authorization.ok) return authorization;

  const body = await readAdminSecurityJson(request);
  if (!body.ok) return body;
  if (!isEmptySecurityRequest(body.value)) {
    return {
      ok: false as const,
      response: problemResponse(ADMIN_SECURITY_PROBLEMS.invalidPayload, {
        traceId: adminSecurityTraceId(request),
      }),
    };
  }
  return { ok: true as const, session: authorization.session };
}

export async function POST(request: Request) {
  const context = await mutationContext(request);
  if (!context.ok) return context.response;

  const result = await beginAdminTotpSetup(context.session, randomUUID());
  return result.ok
    ? adminSecuritySuccess(request, {
        status: result.status,
        manualSecret: result.manualSecret,
        provisioningUri: result.provisioningUri,
      }, 201)
    : adminSecurityLifecycleProblem(request, result.reason);
}

export async function DELETE(request: Request) {
  const context = await mutationContext(request);
  if (!context.ok) return context.response;

  const result = await cancelAdminTotpSetup(context.session, randomUUID());
  return result.ok
    ? adminSecuritySuccess(request, {
        status: result.status,
        cancelled: result.cancelled,
      })
    : adminSecurityLifecycleProblem(request, result.reason);
}
