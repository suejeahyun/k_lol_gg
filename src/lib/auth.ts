const ADMIN_TOKEN_KEY = "admin_token";

const ADMIN_TOKEN_VALUE = process.env.ADMIN_TOKEN_VALUE;

if (!ADMIN_TOKEN_VALUE) {
  throw new Error("ADMIN_TOKEN_VALUE 환경변수가 설정되지 않았습니다.");
}

export const authConstants = {
  ADMIN_TOKEN_KEY,
  ADMIN_TOKEN_VALUE,
};
