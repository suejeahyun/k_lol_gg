const PARTY_ACTIONS = Object.freeze({
  create: ["POST"],
  sync: ["POST"],
  finish: ["POST"],
  status: ["GET", "POST"],
  reset: ["POST"],
  "auto-finish-idle": ["GET", "POST"],
} satisfies Record<string, readonly string[]>);

const SCRIM_ACTIONS = Object.freeze({
  create: ["POST"],
  join: ["POST"],
  confirm: ["POST"],
  finish: ["POST"],
  cancel: ["POST"],
  status: ["GET", "POST"],
} satisfies Record<string, readonly string[]>);

type LegacyRecruitGroup = "party" | "scrim";

function transitionTarget(group: LegacyRecruitGroup, action: string) {
  if (group === "party" && action === "auto-finish-idle") {
    return "/api/internal/jobs/kakao-daily-close";
  }
  if (group === "party" && action === "reset") return "/admin/kakao?tab=health";
  return "/api/integrations/kakao/recruits";
}

function noStoreJson(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/problem+json; charset=utf-8",
      ...headers,
    },
  });
}

/**
 * V1 mutations are deliberately not redirected or translated. Their bearer,
 * query, and body-secret contract cannot safely be upgraded into a V2 raw-body
 * HMAC request on the server because that would bypass sender possession of the
 * new signing key.
 */
export function legacyKakaoRecruitTransitionResponse(input: Readonly<{
  group: LegacyRecruitGroup;
  action: string;
  method: string;
}>) {
  const actions = input.group === "party" ? PARTY_ACTIONS : SCRIM_ACTIONS;
  const allowedMethods = actions[input.action as keyof typeof actions];
  if (!allowedMethods) {
    return noStoreJson({
      code: "NOT_FOUND",
      title: "지원하지 않는 카카오 봇 경로입니다.",
      status: 404,
    }, 404);
  }
  if (!allowedMethods.includes(input.method)) {
    return noStoreJson({
      code: "METHOD_NOT_ALLOWED",
      title: "지원하지 않는 요청 방식입니다.",
      status: 405,
    }, 405, { Allow: allowedMethods.join(", ") });
  }

  const target = transitionTarget(input.group, input.action);
  return noStoreJson({
    code: "KAKAO_BOT_UPGRADE_REQUIRED",
    title: "카카오 봇 업데이트가 필요합니다.",
    status: 410,
    detail: "이전 봇 요청은 처리하지 않습니다. V2 서명 전송 계약으로 봇을 업데이트해 주세요.",
    reply: "[K-LOL.GG 봇 업데이트 필요]\n운영 중인 카카오 봇을 V2 서명 전송 버전으로 업데이트해 주세요.",
    successor: target,
    contractVersion: "KLOL_KAKAO_WEBHOOK_V1",
  }, 410, {
    Deprecation: "true",
    Link: `<${target}>; rel="successor-version"`,
  });
}
