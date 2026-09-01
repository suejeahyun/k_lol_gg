import {
  formatRevisionEtag,
  noStoreJsonResponse,
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  problemResponse,
  readIfMatchRevision,
  readJsonBody,
} from "@/platform/http";
import { PLAYER_HTTP_PROBLEMS } from "@/modules/players/application/player-http-problems";
import {
  parsePlayerWriteInput,
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

type PlayerRouteContext = { params: Promise<{ playerId: string }> };

export async function GET(request: Request, context: PlayerRouteContext) {
  const authorization = await authorizeAdminPlayerApi(request);
  if (!authorization.ok) return authorization.response;
  const { playerId } = await context.params;
  const repository = getRuntimeAdminPlayerRepository();
  if (!repository) {
    return problemResponse(PLAYER_HTTP_PROBLEMS.unavailable, {
      traceId: authorization.traceId,
    });
  }

  try {
    const player = await repository.findById(playerId);
    if (!player) {
      return problemResponse(PLAYER_HTTP_PROBLEMS.notFound, {
        traceId: authorization.traceId,
      });
    }
    return noStoreJsonResponse({ player }, {
      traceId: authorization.traceId,
      headers: { ETag: formatRevisionEtag(player.revision) },
    });
  } catch {
    return problemResponse(PLAYER_HTTP_PROBLEMS.unavailable, {
      traceId: authorization.traceId,
    });
  }
}

export async function PATCH(request: Request, context: PlayerRouteContext) {
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

  const body = await readJsonBody(request, { maximumBytes: 16 * 1024 });
  if (!body.ok) {
    return problemResponse(problemForJsonBodyError(body.error), {
      traceId: authorization.traceId,
    });
  }
  const input = parsePlayerWriteInput(body.value);
  if (!input.ok) {
    return problemResponse(PLAYER_HTTP_PROBLEMS.invalidPlayerInput, {
      traceId: authorization.traceId,
    });
  }

  const { playerId } = await context.params;
  const scope = playerMutationScope("update", playerId);
  const command = buildPlayerMutationCommand({
    request,
    session: authorization.session,
    scope,
    requestFingerprint: playerMutationFingerprint({
      action: "update",
      playerId,
      expectedRevision: expectedRevision.revision,
      player: input.value,
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
      await repository.update(playerId, input.value, expectedRevision.revision, command.command),
      authorization.traceId,
    );
  } catch {
    return problemResponse(PLAYER_HTTP_PROBLEMS.unavailable, {
      traceId: authorization.traceId,
    });
  }
}

export async function DELETE(request: Request, context: PlayerRouteContext) {
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
  const scope = playerMutationScope("deactivate", playerId);
  const command = buildPlayerMutationCommand({
    request,
    session: authorization.session,
    scope,
    requestFingerprint: playerMutationFingerprint({
      action: "deactivate",
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
      await repository.deactivate(playerId, expectedRevision.revision, command.command),
      authorization.traceId,
    );
  } catch {
    return problemResponse(PLAYER_HTTP_PROBLEMS.unavailable, {
      traceId: authorization.traceId,
    });
  }
}
