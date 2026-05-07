const ADMIN_TOKEN_KEY = "admin_token";

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }

  return value;
}

const ADMIN_TOKEN_VALUE =
  process.env.NODE_ENV === "production"
    ? requireEnv("ADMIN_TOKEN_VALUE")
    : process.env.ADMIN_TOKEN_VALUE || "klol-local-admin-token";

export const authConstants = {
  ADMIN_TOKEN_KEY,
  ADMIN_TOKEN_VALUE,
};
