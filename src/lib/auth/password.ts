import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;
const DUMMY_PASSWORD_HASH =
  "$2b$12$t6tN/58akyQy9iWreVLf3ey1zHjeTLSspzmyuTrmQIYxOJ.uZThaq";
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export function getPasswordValidationMessage(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자로 입력해주세요.`;
  }

  if (bcrypt.truncates(password)) {
    return "비밀번호는 UTF-8 기준 72바이트를 초과할 수 없습니다.";
  }

  return null;
}

export async function hashPassword(password: string): Promise<string> {
  if (bcrypt.truncates(password)) {
    throw new Error("Password exceeds bcrypt's 72-byte input limit.");
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function verifyPasswordOrDummy(
  password: string,
  passwordHash: string | null | undefined,
): Promise<boolean> {
  const matches = await bcrypt.compare(password, passwordHash ?? DUMMY_PASSWORD_HASH);
  return Boolean(passwordHash) && matches;
}
