import { cookies } from "next/headers";
import { verifyAuthToken } from "./token";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("user_token")?.value;

  if (!token) return null;

  const payload = verifyAuthToken(token);

  if (!payload) return null;

  return payload;
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

  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  return user;
}