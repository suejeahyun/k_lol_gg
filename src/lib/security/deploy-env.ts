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
  "ADMIN_TOKEN_VALUE",
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
  ADMIN_TOKEN_VALUE: 32,
  SUPER_ADMIN_PASSWORD: 16,
  CRON_SECRET: 16,
  KAKAO_OPENCHAT_SECRET: 12,
  KAKAO_SEARCH_PLAYER_SECRET: 12,
  KAKAO_RECRUIT_SECRET: 12,
};

export function getDeployEnvWarnings(): DeployEnvWarning[] {
  return REQUIRED_DEPLOY_ENV_KEYS.flatMap((key) => {
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
}

export function isDeployEnvReady() {
  return getDeployEnvWarnings().length === 0;
}
