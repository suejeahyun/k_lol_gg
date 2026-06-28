import type { Prisma } from "@prisma/client";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import type { requireAdminRequest } from "@/lib/auth/requireAdmin";

type AdminSession = NonNullable<Awaited<ReturnType<typeof requireAdminRequest>>>;

type WriteSecurityAuditParams = {
  req: Request;
  admin?: AdminSession | null;
  action: string;
  message: string;
  targetType?: string | null;
  targetId?: number | null;
  beforeJson?: Prisma.InputJsonValue | null;
  afterJson?: Prisma.InputJsonValue | null;
  db?: Parameters<typeof writeAdminLog>[0]["db"];
};

export async function writeSecurityAudit({
  req,
  admin = null,
  action,
  message,
  targetType = null,
  targetId = null,
  beforeJson = null,
  afterJson = null,
  db,
}: WriteSecurityAuditParams) {
  const audit = getRequestAuditFields(req);

  await writeAdminLog({
    action,
    message,
    actorId: admin?.user.id ?? null,
    actorType: admin?.user.role ?? null,
    actorUserId: admin?.user.userId ?? null,
    targetType,
    targetId,
    beforeJson,
    afterJson,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
    db,
  });
}
