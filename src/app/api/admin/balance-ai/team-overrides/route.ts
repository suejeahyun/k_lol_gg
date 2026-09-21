import { getDatabase } from "@/platform/db/client";
import { definePublicProblem, problemResponse, readValidatedTraceId } from "@/platform/http";
import { teamBalanceCommandEnvelope } from "@/modules/team-tools/application/team-balance-service";
import { parseTeamBalanceOverride, teamBalanceOverridePlayerId } from "@/modules/team-tools/domain/team-balance-override";
import { TeamBalanceServiceError } from "@/modules/team-tools/domain/team-balance-draft";
import { PostgresTeamBalanceRepository } from "@/modules/team-tools/infrastructure/postgres-team-balance-repository";
import { prepareTeamBalanceMutation, requireTeamBalanceApiSession, teamBalanceErrorResponse, teamBalanceMutationResponse, teamBalanceReadResponse } from "@/modules/team-tools/infrastructure/team-balance-http";

const scope = "admin:team-balance:override";
export const dynamic = "force-dynamic";

function overrideErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof TeamBalanceServiceError) {
    const guidance = {
      INVALID_INPUT: { status: 400, title: "보정 입력이 올바르지 않습니다.", detail: "플레이어, 정수 보정값(-1000~1000), 3~300자 사유를 확인해 주세요." },
      NOT_FOUND: { status: 404, title: "플레이어를 찾을 수 없습니다.", detail: "활성 플레이어를 다시 선택해 주세요." },
      PRECONDITION_FAILED: { status: 412, title: "다른 변경이 먼저 반영되었습니다.", detail: "현재 보정을 다시 확인한 뒤 저장해 주세요." },
    }[error.code as "INVALID_INPUT" | "NOT_FOUND" | "PRECONDITION_FAILED"];
    if (guidance) return problemResponse(definePublicProblem({ code: error.code, ...guidance }), { traceId });
  }
  return teamBalanceErrorResponse(error, traceId);
}

export async function GET(request: Request) {
  const auth = await requireTeamBalanceApiSession("ADMIN", request);
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "playerId") || params.getAll("playerId").length !== 1) throw new TeamBalanceServiceError("INVALID_INPUT", "플레이어를 선택해 주세요.");
    const playerId = teamBalanceOverridePlayerId(params.get("playerId"));
    const result = await new PostgresTeamBalanceRepository(getDatabase()).getPlayerOverride(playerId);
    return teamBalanceReadResponse(result, result.revision, traceId);
  } catch (error) { return overrideErrorResponse(error, traceId); }
}

export async function POST(request: Request) {
  const auth = await requireTeamBalanceApiSession("SUPER_ADMIN", request);
  if (!auth.ok) return auth.response;
  const prepared = await prepareTeamBalanceMutation(request, scope, auth.session);
  if (!prepared.ok) return prepared.response;
  try {
    const input = parseTeamBalanceOverride(prepared.value.body);
    const result = await new PostgresTeamBalanceRepository(getDatabase()).setPlayerOverride(
      teamBalanceCommandEnvelope(prepared.value.context, scope, { ...input, expectedRevision: prepared.value.expectedRevision }),
      prepared.value.expectedRevision, input,
    );
    return teamBalanceMutationResponse(result, prepared.value.traceId);
  } catch (error) { return overrideErrorResponse(error, prepared.value.traceId); }
}
