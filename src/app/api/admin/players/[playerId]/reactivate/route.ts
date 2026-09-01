import {
  problemForIfMatchRevisionError,
  problemResponse,
  readIfMatchRevision,
} from "@/platform/http";
import { PLAYER_HTTP_PROBLEMS } from "@/modules/players/application/player-http-problems";
import {
  playerMutationFingerprint,
  playerMutationScope,
} from "@/modules/players/domain/admin-player";
import {
  authorizeAdminPlayerApi,
  buildPlayerMutationCommand,
  guardAdminMutationOrigin,
  playerMutationResponse,
} from "@/modules/players/infrastructure/admin-player-http";
import { getRuntimeAdminPlayerRepository } from "@/modules/players/infrastructure/runtime-admin-player-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PlayerReactivateRouteContext = { params: Promise<{ playerId: string }> };

export async function POST(request: Request, context: PlayerReactivateRouteContext) {
  const authorization = await authorizeAdminPlayerApi(request);
  if (!authorization.ok) return authorization.response;
  const originFailure = guardAdminMutationOrigin(request, authorization.traceId);
  if (originFailure) return originFailure;

  const expectedRevision = readIfMatchRevision(request.headers);
  if (!expectedRevision.ok) {
    return problemResponse(problemForIfMatchRevisionError(expectedRevision.error), {
      traceId: authorization.traceId,
    });
  }

  const { playerId } = await context.params;
  const scope = playerMutationScope("reactivate", playerId);
  const command = buildPlayerMutationCommand({
    request,
    session: authorization.session,
    scope,
    requestFingerprint: playerMutationFingerprint({
      action: "reactivate",
      playerId,
      expectedRevision: expectedRevision.revision,
    }),
  });
  if (!command.ok) return command.response;

  const repository = getRuntimeAdminPlayerRepository();
  if (!repository) {
    return problemResponse(PLAYER_HTTP_PROBLEMS.unavailable, {
      traceId: authorization.traceId,
    });
  }

  try {
    return playerMutationResponse(
      await repository.reactivate(
        playerId,
        expectedRevision.revision,
        command.command,
      ),
      authorization.traceId,
    );
  } catch {
    return problemResponse(PLAYER_HTTP_PROBLEMS.unavailable, {
      traceId: authorization.traceId,
    });
  }
}
