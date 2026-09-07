import { createHash, randomUUID } from "node:crypto";

import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { exactObject, prepareRiotMutation, requireRiotApiSession, riotErrorResponse, riotInvalidInputResponse, riotMutationResponse, riotNotFoundResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";

export const dynamic = "force-dynamic";

function accountRedirect(status: "connected" | "denied" | "failed") {
  const origin = process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN;
  if (!origin) return riotUnavailableResponse();
  const location = new URL("/account/riot", origin);
  location.searchParams.set("rso", status);
  return Response.redirect(location, 303);
}

export async function GET(request: Request) {
  const auth = await requireRiotApiSession("USER");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  if (url.searchParams.has("error")) {
    if (keys.some((key) => !["error", "error_description", "state"].includes(key))) {
      return accountRedirect("failed");
    }
    return accountRedirect("denied");
  }
  if (keys.length !== 2 || !url.searchParams.has("state") || !url.searchParams.has("code")) {
    return accountRedirect("failed");
  }
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!state || state.length > 1_000 || !code || code.length > 2_000) return accountRedirect("failed");
  const runtime = getRuntimeRiot();
  if (!runtime) return accountRedirect("failed");
  try {
    const owner = await runtime.query.getOwnerStatus(auth.session.userId);
    if (!owner) return accountRedirect("failed");
    const codeDigest = createHash("sha256").update(code).digest("hex");
    await runtime.service.completeRso({
      context: {
        principalId: auth.session.userId,
        requestId: randomUUID(),
        issuedAt: new Date().toISOString(),
        authorizationIntent: {
          kind: "OWNER_SESSION",
          sessionId: auth.session.sessionId,
          role: auth.session.role,
          authVersion: auth.session.authVersion,
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
    return accountRedirect("connected");
  } catch {
    return accountRedirect("failed");
  }
}

export async function POST(request: Request) {
  const auth = await requireRiotApiSession("USER"); if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:rso:callback", { revision: "required" }); if (!prepared.ok) return prepared.response;
  const body = prepared.value.body;
  if (!exactObject(body, ["state", "code"]) || typeof body.state !== "string" || typeof body.code !== "string") return riotInvalidInputResponse(prepared.value.traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(prepared.value.traceId);
  try {
    const owner = await runtime.query.getOwnerStatus(auth.session.userId); if (!owner) return riotNotFoundResponse(prepared.value.traceId);
    return riotMutationResponse(await runtime.service.completeRso({ context: prepared.value.context, playerId: owner.playerId, expectedRevision: prepared.value.expectedRevision, publicState: body.state, authorizationCode: body.code }), prepared.value.traceId);
  } catch (error) { return riotErrorResponse(error, prepared.value.traceId); }
}
