import "server-only";

import { SERVICE_BRAND } from "@/lib/service-brand";
import { definePublicProblem, problemResponse, readValidatedTraceId } from "@/platform/http";
import { communityModuleForNewAction } from "../domain/module-access";
import type { CommunityModuleId } from "../domain/site-configuration";
import { readRuntimeCommunitySiteConfiguration } from "./runtime-site-configuration";

const disabled = definePublicProblem({ code: "COMMUNITY_MODULE_DISABLED", status: 403, title: "이 기능의 신규 접수가 중지되어 있습니다.", detail: "기존 기록 확인과 취소·운영진 마무리는 계속할 수 있습니다. 다시 열리는 일정은 커뮤니티 운영진에게 확인해 주세요." });
const unavailable = definePublicProblem({ code: "COMMUNITY_SITE_CONFIGURATION_UNAVAILABLE", status: 503, title: "커뮤니티 설정을 확인할 수 없습니다.", detail: "신규 작업을 잠시 중지했습니다. 잠시 후 다시 시도해 주세요." });

export async function isRuntimeCommunityModuleEnabled(module: CommunityModuleId): Promise<boolean> {
  const runtime = await readRuntimeCommunitySiteConfiguration();
  return runtime === null || runtime.configuration.modules[module];
}

export async function requireCommunityModule(request: Request, module: CommunityModuleId): Promise<Response | null> {
  if (SERVICE_BRAND.id !== "community") return null;
  const traceId = readValidatedTraceId(request.headers);
  try {
    return await isRuntimeCommunityModuleEnabled(module) ? null : problemResponse(disabled, { traceId, headers: { "X-Community-Module": module } });
  } catch {
    return problemResponse(unavailable, { traceId });
  }
}

export async function requireCommunityModuleForRequest(request: Request): Promise<Response | null> {
  if (SERVICE_BRAND.id !== "community") return null;
  const moduleId = communityModuleForNewAction(new URL(request.url).pathname, request.method);
  return moduleId ? requireCommunityModule(request, moduleId) : null;
}
