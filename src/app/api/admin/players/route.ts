import {
  noStoreJsonResponse,
  problemForJsonBodyError,
  problemResponse,
  readJsonBody,
} from "@/platform/http";
import { parseAdminPlayerQuery } from "@/modules/players/application/parse-admin-player-query";
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

export async function GET(request: Request) {
  const authorization = await authorizeAdminPlayerApi(request);
  if (!authorization.ok) return authorization.response;

  const parsedQuery = parseAdminPlayerQuery(new URL(request.url).searchParams);
  if (!parsedQuery.ok) {
    return problemResponse(PLAYER_HTTP_PROBLEMS.invalidPlayerQuery, {
      traceId: authorization.traceId,
    });
  }

  const repository = getRuntimeAdminPlayerRepository();
  if (!repository) {
    return problemResponse(PLAYER_HTTP_PROBLEMS.unavailable, {
      traceId: authorization.traceId,
    });
  }

  try {
    return noStoreJsonResponse(await repository.list(parsedQuery.value), {
      traceId: authorization.traceId,
    });
  } catch {
    return problemResponse(PLAYER_HTTP_PROBLEMS.unavailable, {
      traceId: authorization.traceId,
    });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminPlayerApi(request);
  if (!authorization.ok) return authorization.response;
  const originFailure = guardAdminMutationOrigin(request, authorization.traceId);
  if (originFailure) return originFailure;

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

  const scope = playerMutationScope("create");
  const command = buildPlayerMutationCommand({
    request,
    session: authorization.session,
    scope,
    requestFingerprint: playerMutationFingerprint({ action: "create", player: input.value }),
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
      await repository.create(input.value, command.command),
      authorization.traceId,
    );
  } catch {
    return problemResponse(PLAYER_HTTP_PROBLEMS.unavailable, {
      traceId: authorization.traceId,
    });
  }
}
