import { getAdminTotpStatus } from "@/modules/auth/infrastructure/admin-totp-lifecycle";
import {
  adminSecurityLifecycleProblem,
  adminSecuritySuccess,
  requireAdminSecuritySession,
} from "@/modules/auth/infrastructure/admin-security-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdminSecuritySession(request);
  if (!authorization.ok) return authorization.response;

  const result = await getAdminTotpStatus(authorization.session);
  return result.ok
    ? adminSecuritySuccess(request, { status: result.status })
    : adminSecurityLifecycleProblem(request, result.reason);
}
