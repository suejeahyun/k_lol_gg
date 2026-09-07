import type { AdminAccountListQuery } from "../domain/account-contracts";
import { containsUnsafeText } from "@/platform/security/input-safety";

const allowedKeys = new Set(["q", "status", "role", "deleted", "page", "pageSize"]);
const positiveIntegerPattern = /^[1-9][0-9]{0,3}$/;

type QueryResult =
  | Readonly<{ ok: true; value: AdminAccountListQuery }>
  | Readonly<{ ok: false }>;

export function parseAdminAccountQuery(params: URLSearchParams): QueryResult {
  for (const key of params.keys()) {
    if (!allowedKeys.has(key) || params.getAll(key).length !== 1) return { ok: false };
  }

  const query = (params.get("q") ?? "").trim().normalize("NFKC");
  const status = params.get("status") ?? "ALL";
  const role = params.get("role") ?? "ALL";
  const deleted = params.get("deleted") ?? "ACTIVE";
  const pageRaw = params.get("page") ?? "1";
  const pageSizeRaw = params.get("pageSize") ?? "20";

  if (
    query.length > 100 ||
    containsUnsafeText(query) ||
    !["ALL", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"].includes(status) ||
    !["ALL", "USER", "ADMIN", "SUPER_ADMIN"].includes(role) ||
    !["ACTIVE", "DELETED", "ALL"].includes(deleted) ||
    !positiveIntegerPattern.test(pageRaw) ||
    !positiveIntegerPattern.test(pageSizeRaw)
  ) {
    return { ok: false };
  }

  const page = Number(pageRaw);
  const pageSize = Number(pageSizeRaw);
  if (page > 10_000 || ![10, 20, 50].includes(pageSize)) return { ok: false };

  return {
    ok: true,
    value: {
      query,
      status: status as AdminAccountListQuery["status"],
      role: role as AdminAccountListQuery["role"],
      deleted: deleted as AdminAccountListQuery["deleted"],
      page,
      pageSize,
    },
  };
}
