import { TeamBalanceServiceError } from "@/modules/team-tools";
import {
  requireTeamBalanceApiSession,
  teamBalanceErrorResponse,
  teamBalanceReadResponse,
  teamBalanceUnavailableResponse,
} from "@/modules/team-tools/infrastructure/team-balance-http";
import { getRuntimeTeamBalanceCandidateRepository } from "@/modules/team-tools/infrastructure/runtime-team-balance-candidates";
import { parseTeamBalanceCandidateQuery } from "@/modules/team-tools/infrastructure/team-balance-query";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireTeamBalanceApiSession("USER", request);
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  const query = parseTeamBalanceCandidateQuery(request.url);
  if (!query) {
    return teamBalanceErrorResponse(
      new TeamBalanceServiceError("INVALID_INPUT", "후보 조회 조건이 올바르지 않습니다."),
      traceId,
    );
  }

  if (query.source === "players") {
    const repository = getRuntimeTeamBalanceCandidateRepository();
    if (!repository) return teamBalanceUnavailableResponse(traceId);
    try {
      return teamBalanceReadResponse(await repository.searchPlayers(query.query), undefined, traceId);
    } catch (error) {
      return teamBalanceErrorResponse(error, traceId);
    }
  }

  const repository = getRuntimeTeamBalanceCandidateRepository();
  if (!repository) return teamBalanceUnavailableResponse(traceId);
  try {
    const candidates = await repository.listSeasonGroups({
      origin: query.origin,
      days: query.days,
      now: new Date(),
    });
    return teamBalanceReadResponse(candidates, undefined, traceId);
  } catch (error) {
    return teamBalanceErrorResponse(error, traceId);
  }
}
