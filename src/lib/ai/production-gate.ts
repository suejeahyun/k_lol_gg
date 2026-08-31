export const AI_TEMPORARILY_DISABLED_RESPONSE = {
  ok: false,
  code: "AI_TEMPORARILY_DISABLED",
  message: "AI 기능은 개인정보 처리 기준 정비 중이라 잠시 사용할 수 없습니다.",
} as const;

export function isProductionAiHardDisabled(environment = process.env.NODE_ENV) {
  return environment === "production";
}
