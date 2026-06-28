import jwt from "jsonwebtoken";

export type AuthTokenPayload = {
  userAccountId: number;
  userId?: number | string;
  role?: string;
  status?: string;
  playerId?: number | null;
};

const JWT_ISSUER = "k-lol-gg";
const JWT_AUDIENCE = "k-lol-gg-web";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  return secret;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: (process.env.AUTH_TOKEN_MAX_AGE || "7d") as jwt.SignOptions["expiresIn"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (!decoded || typeof decoded !== "object") {
      return null;
    }

    const payload = decoded as jwt.JwtPayload;

    const rawUserAccountId = payload.userAccountId;
    const userAccountId =
      typeof rawUserAccountId === "number"
        ? rawUserAccountId
        : typeof rawUserAccountId === "string"
          ? Number(rawUserAccountId)
          : NaN;

    if (!Number.isFinite(userAccountId)) {
      return null;
    }

    const rawUserId = payload.userId;
    const userId =
      typeof rawUserId === "number" || typeof rawUserId === "string"
        ? rawUserId
        : undefined;

    const rawPlayerId = payload.playerId;
    const playerId =
      typeof rawPlayerId === "number"
        ? rawPlayerId
        : typeof rawPlayerId === "string"
          ? Number(rawPlayerId)
          : null;

    return {
      userAccountId,
      userId,
      role: typeof payload.role === "string" ? payload.role : undefined,
      status: typeof payload.status === "string" ? payload.status : undefined,
      playerId: Number.isFinite(playerId) ? playerId : null,
    };
  } catch {
    return null;
  }
}
