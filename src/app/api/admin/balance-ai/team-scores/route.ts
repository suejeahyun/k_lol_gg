import { getDatabase } from "@/platform/db/client";
import { definePublicProblem, problemResponse, readValidatedTraceId } from "@/platform/http";
import { parseTeamScoreQuery } from "@/modules/team-tools/application/team-score-query";
import { TeamBalanceServiceError } from "@/modules/team-tools/domain/team-balance-draft";
import { PostgresTeamScoreRepository } from "@/modules/team-tools/infrastructure/postgres-team-score-repository";
import { requireTeamBalanceApiSession, teamBalanceErrorResponse, teamBalanceReadResponse } from "@/modules/team-tools/infrastructure/team-balance-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTeamBalanceApiSession("ADMIN", request);
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  try {
    const query = parseTeamScoreQuery(request.url);
    const result = await new PostgresTeamScoreRepository(getDatabase()).read(query);
    return teamBalanceReadResponse(result, undefined, traceId);
  } catch (error) {
    if (error instanceof TeamBalanceServiceError && (error.code === "INVALID_INPUT" || error.code === "NOT_FOUND")) {
      const missing = error.code === "NOT_FOUND";
      return problemResponse(definePublicProblem({ code: error.code, status: missing ? 404 : 400,
        title: missing ? "플레이어를 찾을 수 없습니다." : "점수 조회 조건이 올바르지 않습니다.",
        detail: missing ? "활성 플레이어를 다시 선택해 주세요." : "플레이어, 검색어와 페이지 범위를 확인해 주세요." }), { traceId });
    }
    return teamBalanceErrorResponse(error, traceId);
  }
}
