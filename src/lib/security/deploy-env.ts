export type DeployEnvWarning = {
  key: string;
  level: "missing" | "weak";
  message: string;
};

const REQUIRED_DEPLOY_ENV_KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_BASE_URL",
  "JWT_SECRET",
  "ADMIN_TOKEN_VALUE",
  "SUPER_ADMIN_ID",
  "SUPER_ADMIN_PASSWORD",
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

    if (value.length < 12) {
      warnings.push({
        key,
        level: "weak",
        message: "12자 미만",
      });
    }

    if (WEAK_EXACT_VALUES.has(normalized)) {
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
