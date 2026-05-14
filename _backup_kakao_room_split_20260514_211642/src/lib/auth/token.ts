import jwt from "jsonwebtoken";

export type AuthTokenPayload = {
  userAccountId: number;
  userId: string;
  role: string;
  status: string;
  playerId?: number | null;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET 환경변수가 설정되지 않았습니다.");
  }

  return secret;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "7d",
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());

    if (!decoded || typeof decoded !== "object") {
      return null;
    }

    const payload = decoded as Partial<AuthTokenPayload>;

    if (
      typeof payload.userAccountId !== "number" ||
      typeof payload.userId !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.status !== "string"
    ) {
      return null;
    }

    return {
      userAccountId: payload.userAccountId,
      userId: payload.userId,
      role: payload.role,
      status: payload.status,
      playerId:
        typeof payload.playerId === "number" || payload.playerId === null
          ? payload.playerId
          : undefined,
    };
  } catch {
    return null;
  }
}