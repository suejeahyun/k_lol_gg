import "server-only";

import type { AuthRole } from "@/modules/auth/domain/auth-session";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import { definePublicProblem, problemResponse } from "@/platform/http";

const unauthenticated = definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "로그인이 필요합니다.", detail: "요청에 맞는 계정으로 로그인해 주세요." });
const forbidden = definePublicProblem({ code: "FORBIDDEN", status: 403, title: "멸망전 작업 권한이 없습니다.", detail: "승인 계정 소유권 또는 관리자 2단계 인증과 역할을 확인해 주세요." });

export async function requireDestructionApiSession(role: AuthRole) {
  const decision = await authorizeApiRole(role);
  if (decision.allowed) return { ok: true as const, session: decision.session };
  return { ok: false as const, response: problemResponse(decision.reason === "UNAUTHENTICATED" ? unauthenticated : forbidden) };
}
