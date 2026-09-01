import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";

export const metadata: Metadata = {
  title: "관리자",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageRole("ADMIN", "/admin");
  return <AdminShell session={session}>{children}</AdminShell>;
}
