import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { requireApprovedUser } from "@/lib/auth/session";

export async function requireApprovedUserOrAdmin() {
  const admin = await requireAdminRequest();
  if (admin) return { type: "admin" as const, admin };

  const user = await requireApprovedUser();
  return { type: "user" as const, user };
}

export function getAccessErrorResponseMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return { message: "로그인이 필요합니다.", status: 401 } as const;
    }

    if (error.message === "NOT_APPROVED") {
      return { message: "승인된 유저만 접근할 수 있습니다.", status: 403 } as const;
    }
  }

  return { message: fallback, status: 500 } as const;
}
