import { randomUUID } from "node:crypto";

import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { prepareDisciplineJsonMutation, requireDisciplineApiSession } from "@/modules/discipline/infrastructure/discipline-http";
import { parseKakaoImageSessionBody, parseKakaoImageSessionRevokeBody } from "@/modules/recruiting/kakao-assistant/domain";
import { kakaoImageSessionResponse, kakaoOwnerImageSessionErrorResponse } from "@/modules/recruiting/kakao-assistant/http";
import { getRuntimeKakaoImageReceive } from "@/modules/recruiting/kakao-assistant/runtime";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ taskId: string }> };

async function mutate(request: Request, context: Context, action: "CREATE" | "REVOKE") {
  const auth = await requireDisciplineApiSession("USER");
  if (!auth.ok) return auth.response;
  if (action === "CREATE" && !await isRuntimeKakaoFeatureEnabled("imageReceiveEnabled")) {
    return kakaoOwnerImageSessionErrorResponse(new Error("KAKAO_IMAGE_RECEIVE_DISABLED"));
  }
  const { taskId } = await context.params;
  const scope = `me:discipline:tasks:${taskId}:kakao-session:${action.toLowerCase()}`;
  const prepared = await prepareDisciplineJsonMutation(request, 2_048);
  if (!prepared.ok) return prepared.response;
  try {
    const service = getRuntimeKakaoImageReceive();
    if (!service) throw new Error("KAKAO_IMAGE_SERVICE_UNAVAILABLE");
    const common = {
      actorSession: transactionSessionActor(auth.session), targetType: "DISCIPLINE_TASK" as const,
      targetReference: taskId, expectedRevision: prepared.expectedRevision, requestKey: prepared.requestKey,
      bodyDigestHex: prepared.bodyDigestHex, requestId: randomUUID(), scope,
    };
    const result = action === "CREATE"
      ? await service.createOwnerSession({ ...common, ...parseKakaoImageSessionBody(prepared.body) })
      : await service.revokeOwnerSession({ ...common, ...parseKakaoImageSessionRevokeBody(prepared.body) });
    return kakaoImageSessionResponse(result, prepared.traceId);
  } catch (error) { return kakaoOwnerImageSessionErrorResponse(error, prepared.traceId); }
}

export async function POST(request: Request, context: Context) { return mutate(request, context, "CREATE"); }
export async function DELETE(request: Request, context: Context) { return mutate(request, context, "REVOKE"); }
