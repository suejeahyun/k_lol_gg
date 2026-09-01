import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminShell } from "@/components/admin/admin-shell";
import { ADMIN_REQUEST_PATH_HEADER } from "@/modules/auth/application/admin-request-path";
import { normalizeInternalNext } from "@/modules/auth/application/normalize-internal-next";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";

export const metadata: Metadata = {
  title: "관리자",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const requestPath = normalizeInternalNext(
    (await headers()).get(ADMIN_REQUEST_PATH_HEADER) ?? undefined,
    "/admin",
  );
  const session = await requirePageRole("ADMIN", requestPath);
  return <AdminShell session={session}>{children}</AdminShell>;
}
