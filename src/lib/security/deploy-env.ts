export type DeployEnvWarning = {
  key: string;
  level: "missing" | "weak";
  message: string;
};

const REQUIRED_DEPLOY_ENV_KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_BASE_URL",
  "JWT_SECRET",
  "TOTP_ENCRYPTION_KEY",
  "SUPER_ADMIN_ID",
  "SUPER_ADMIN_PASSWORD",
  "CRON_SECRET",
  "PRIVACY_CONTACT",
  "KAKAO_OPENCHAT_SECRET",
  "KAKAO_SEARCH_PLAYER_SECRET",
  "KAKAO_RECRUIT_SECRET",
] as const;

const WEAK_EXACT_VALUES = new Set([
  "admin",
  "password",
  "pass",
  "test",
  "klol",
  "1234",
  "7942",
]);

const MINIMUM_SECRET_LENGTHS: Partial<Record<(typeof REQUIRED_DEPLOY_ENV_KEYS)[number], number>> = {
  JWT_SECRET: 32,
  TOTP_ENCRYPTION_KEY: 32,
  SUPER_ADMIN_PASSWORD: 16,
  CRON_SECRET: 16,
  KAKAO_OPENCHAT_SECRET: 12,
  KAKAO_SEARCH_PLAYER_SECRET: 12,
  KAKAO_RECRUIT_SECRET: 12,
};

export function getDeployEnvWarnings(): DeployEnvWarning[] {
  const warnings = REQUIRED_DEPLOY_ENV_KEYS.flatMap((key) => {
    const value = process.env[key]?.trim() ?? "";

    if (!value) {
      return [
        {
          key,
          level: "missing" as const,
          message: "미설정",
        },
      ];
    }

    const warnings: DeployEnvWarning[] = [];
    const normalized = value.toLowerCase();

    const minimumLength = MINIMUM_SECRET_LENGTHS[key];

    if (minimumLength && value.length < minimumLength) {
      warnings.push({
        key,
        level: "weak",
        message: `${minimumLength}자 미만`,
      });
    }

    if (minimumLength && WEAK_EXACT_VALUES.has(normalized)) {
      warnings.push({
        key,
        level: "weak",
        message: "추측 가능한 값",
      });
    }

    return warnings;
  });

  if (["1", "true", "yes", "on"].includes(
    String(process.env.ALLOW_LEGACY_ADMIN_TOKEN || "").toLowerCase(),
  )) {
    warnings.push({
      key: "ALLOW_LEGACY_ADMIN_TOKEN",
      level: "weak",
      message: "레거시 관리자 토큰 사용 금지",
    });
  }

  for (const [activeKey, nextKey] of [
    ["KAKAO_RECRUIT_SECRET", "KAKAO_RECRUIT_SECRET_NEXT"],
    ["KAKAO_SEARCH_PLAYER_SECRET", "KAKAO_SEARCH_PLAYER_SECRET_NEXT"],
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(process.env, nextKey)) continue;

    const activeValue = process.env[activeKey]?.trim() ?? "";
    const nextValue = process.env[nextKey]?.trim() ?? "";
    if (!nextValue || !activeValue || nextValue === activeValue || nextValue.length < 12) {
      warnings.push({
        key: nextKey,
        level: "weak",
        message: "이중 키 구성 정책 미충족",
      });
    }

    const deployEnvironment = String(process.env.DEPLOY_ENV || process.env.VERCEL_ENV || "").toLowerCase();
    if (deployEnvironment === "production" && process.env.SECURITY_REQUIRE_KAKAO_SECRET !== "true") {
      warnings.push({
        key: nextKey,
        level: "weak",
        message: "Production 서버 인증 강제 필요",
      });
    }
  }

  return warnings;
}

export function isDeployEnvReady() {
  return getDeployEnvWarnings().length === 0;
}
