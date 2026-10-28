import "server-only";

import type { PublicFeatureFlags } from "../domain/site-settings";
import { getRuntimeOperationsRepository } from "./runtime-operations";
import { definePublicProblem, problemResponse, readValidatedTraceId } from "@/platform/http";
import { SERVICE_BRAND } from "@/lib/service-brand";

export type SiteFeatureKey = keyof PublicFeatureFlags;
export type SiteFeatureState = "enabled" | "disabled" | "unavailable";

const labels: Readonly<Record<SiteFeatureKey, string>> = Object.freeze({
  registrations: "회원가입",
  matchSubmissions: "경기 결과 제출",
  teamBalance: "팀 밸런스",
  kakaoHelp: "카카오 도움말",
  riotIntegration: "Riot 연동",
  aiAssistant: "AI 도우미",
});

const featureDisabled = definePublicProblem({
  code: "SITE_FEATURE_DISABLED",
  status: 403,
  title: "현재 사용할 수 없는 기능입니다.",
  detail: "운영 설정에서 이 기능이 다시 열리면 사용할 수 있습니다.",
});

const settingsUnavailable = definePublicProblem({
  code: "SITE_SETTINGS_UNAVAILABLE",
  status: 503,
  title: "사이트 설정을 확인할 수 없습니다.",
  detail: "안전을 위해 기능을 잠시 닫았습니다. 잠시 후 다시 시도해 주세요.",
});

export function siteFeatureLabel(feature: SiteFeatureKey) {
  return labels[feature];
}

export async function readSiteFeatureState(feature: SiteFeatureKey): Promise<SiteFeatureState> {
  if (SERVICE_BRAND.id === "community") {
    try {
      const { readRuntimeCommunitySiteConfiguration } = await import("@/modules/community-sites/infrastructure/runtime-site-configuration");
      const runtime = await readRuntimeCommunitySiteConfiguration();
      if (!runtime) return "unavailable";
      // Existing submission/lineup history must stay reachable when new work stops.
      // Actual create actions are checked separately on each server request.
      if (feature === "matchSubmissions" || feature === "teamBalance") return "enabled";
      if (feature === "registrations") return runtime.configuration.modules.members ? "enabled" : "disabled";
      if (feature === "aiAssistant") return "disabled";
      return runtime.configuration.modules[feature] ? "enabled" : "disabled";
    } catch { return "unavailable"; }
  }
  const repository = getRuntimeOperationsRepository();
  if (!repository) return "unavailable";
  try {
    const settings = await repository.getSiteSettings();
    return settings.features[feature] ? "enabled" : "disabled";
  } catch {
    return "unavailable";
  }
}

/** Fail closed when the settings store cannot be read. */
export async function requireSiteFeature(request: Request, feature: SiteFeatureKey) {
  if (SERVICE_BRAND.id === "community") {
    const { requireCommunityModuleForRequest } = await import("@/modules/community-sites/infrastructure/module-access");
    const failure = await requireCommunityModuleForRequest(request);
    if (failure) return failure;
  }
  const state = await readSiteFeatureState(feature);
  if (state === "enabled") return null;
  const traceId = readValidatedTraceId(request.headers);
  return problemResponse(state === "disabled" ? featureDisabled : settingsUnavailable, {
    traceId,
    headers: { "X-Site-Feature": feature },
  });
}
