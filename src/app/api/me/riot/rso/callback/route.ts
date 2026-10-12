import { createHash, randomUUID } from "node:crypto";

import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { clearRsoCallbackBinding, getRsoCallbackSession } from "@/modules/riot/infrastructure/runtime-rso-callback";
import { rsoCompletionResponse } from "@/modules/riot/infrastructure/riot-rso-completion";
import { exactObject, prepareRiotMutation, requireRiotApiSession, riotErrorResponse, riotInvalidInputResponse, riotMutationResponse, riotNotFoundResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const finish = (status: "connected" | "denied" | "failed") => clearRsoCallbackBinding(rsoCompletionResponse(status), request);
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  const state = url.searchParams.get("state") ?? "";
  if (url.searchParams.getAll("state").length !== 1) return finish("failed");
  const session = await getRsoCallbackSession(state);
  if (!session) return finish("failed");
  if (url.searchParams.has("error")) {
    if (keys.some((key) => !["error", "error_description", "state"].includes(key)) || new Set(keys).size !== keys.length) {
      return finish("failed");
    }
    return finish("denied");
  }
  if (keys.length !== 2 || !url.searchParams.has("state") || !url.searchParams.has("code")) {
    return finish("failed");
  }
  const code = url.searchParams.get("code") ?? "";
  if (!state || state.length > 1_000 || !code || code.length > 2_000) return finish("failed");
  const runtime = getRuntimeRiot();
  if (!runtime?.rsoAvailable) return finish("failed");
  try {
    const owner = await runtime.query.getOwnerStatus(session.userId);
    if (!owner) return finish("failed");
    const codeDigest = createHash("sha256").update(code).digest("hex");
    await runtime.service.completeRso({
      context: {
        principalId: session.userId,
        requestId: randomUUID(),
        issuedAt: new Date().toISOString(),
        authorizationIntent: {
          kind: "OWNER_SESSION",
          sessionId: session.sessionId,
          role: session.role,
          authVersion: session.authVersion,
          transactionRecheck: true,
        },
        idempotencyKeyMaterial: createHash("sha256")
          .update("klol-v2:riot-rso-callback:r1\0")
          .update(state)
          .digest(),
        bodyDigestHex: createHash("sha256")
          .update("klol-v2:riot-rso-callback-body:r1\0")
          .update(codeDigest)
          .digest("hex"),
      },
      playerId: owner.playerId,
      expectedRevision: owner.link?.revision ?? 0,
      publicState: state,
      authorizationCode: code,
    });
    return finish("connected");
  } catch {
    return finish("failed");
  }
}

export async function POST(request: Request) {
  const auth = await requireRiotApiSession("USER"); if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:rso:callback", { revision: "required" }); if (!prepared.ok) return prepared.response;
  const body = prepared.value.body;
  if (!exactObject(body, ["state", "code"]) || typeof body.state !== "string" || typeof body.code !== "string") return riotInvalidInputResponse(prepared.value.traceId);
  const runtime = getRuntimeRiot(); if (!runtime?.rsoAvailable) return riotUnavailableResponse(prepared.value.traceId);
  try {
    const owner = await runtime.query.getOwnerStatus(auth.session.userId); if (!owner) return riotNotFoundResponse(prepared.value.traceId);
    return riotMutationResponse(await runtime.service.completeRso({ context: prepared.value.context, playerId: owner.playerId, expectedRevision: prepared.value.expectedRevision, publicState: body.state, authorizationCode: body.code }), prepared.value.traceId);
  } catch (error) { return riotErrorResponse(error, prepared.value.traceId); }
}
