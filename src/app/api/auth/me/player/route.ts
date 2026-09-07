import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import {
  accountMutationResponse,
  authorizeAccountApi,
  buildAccountMutationCommand,
  guardAccountMutationOrigin,
  guardExactAccountQuery,
} from "@/modules/accounts/infrastructure/account-http";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import {
  formatRevisionEtag,
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  noStoreJsonResponse,
  problemResponse,
  readIfMatchRevision,
  readJsonBody,
} from "@/platform/http";
import {
  accountMutationScope,
  fingerprintAccountMutation,
  parseOwnPlayerInput,
} from "@/modules/accounts/domain/account-contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeAccountApi(request);
  if (!authorization.ok) return authorization.response;
  const queryFailure = guardExactAccountQuery(request, [], authorization.traceId);
  if (queryFailure) return queryFailure;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  try {
    const account = await repository.findSelf(authorization.session.userId);
    return account
      ? noStoreJsonResponse(
          { player: account.player, playerClaim: account.playerClaim },
          {
            traceId: authorization.traceId,
            headers: account.player ? { ETag: formatRevisionEtag(account.player.revision) } : undefined,
          },
        )
      : problemResponse(ACCOUNT_HTTP_PROBLEMS.notFound, { traceId: authorization.traceId });
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeAccountApi(request);
  if (!authorization.ok) return authorization.response;
  const queryFailure = guardExactAccountQuery(request, [], authorization.traceId);
  if (queryFailure) return queryFailure;
  const originFailure = guardAccountMutationOrigin(request, authorization.traceId);
  if (originFailure) return originFailure;
  const expectedRevision = readIfMatchRevision(request.headers);
  if (!expectedRevision.ok) {
    return problemResponse(problemForIfMatchRevisionError(expectedRevision.error), { traceId: authorization.traceId });
  }
  const body = await readJsonBody(request, { maximumBytes: 8 * 1024 });
  if (!body.ok) {
    return problemResponse(problemForJsonBodyError(body.error), { traceId: authorization.traceId });
  }
  const input = parseOwnPlayerInput(body.value);
  if (!input.ok) return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, { traceId: authorization.traceId });
  const scope = accountMutationScope("self-player", authorization.session.userId);
  const command = buildAccountMutationCommand({
    request,
    scope,
    principalKey: authorization.session.userId,
    requestFingerprint: fingerprintAccountMutation({
      action: "self-player",
      expectedPlayerRevision: expectedRevision.revision,
      player: input.value,
    }),
    session: authorization.session,
  });
  if (!command.ok) return command.response;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  try {
    return accountMutationResponse(
      await repository.updateOwnPlayer(input.value, expectedRevision.revision, command.command),
      authorization.traceId,
    );
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  }
}
