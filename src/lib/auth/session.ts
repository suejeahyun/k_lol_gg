import { cookies } from "next/headers";
import { verifyAuthToken } from "./token";
import { prisma } from "@/lib/prisma/client";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("user_token")?.value;

  if (!token) return null;

  const payload = verifyAuthToken(token);

  if (!payload?.userAccountId) return null;

  const user = await prisma.userAccount.findUnique({
    where: {
      id: payload.userAccountId,
      deletedAt: null,
    },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      authVersion: true,
      player: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!user || (payload.authVersion ?? 0) !== user.authVersion) return null;

  return {
    userAccountId: user.id,
    userId: user.userId,
    role: user.role,
    status: user.status,
    playerId: user.player?.id ?? null,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}

export async function requireApprovedUser() {
  const user = await requireUser();

  if (user.status !== "APPROVED") {
    throw new Error("NOT_APPROVED");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUser();

  if ((user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") || user.status !== "APPROVED") {
    throw new Error("FORBIDDEN");
  }

  return user;
}
