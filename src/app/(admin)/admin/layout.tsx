import { ReactNode } from "react";
import type { Metadata } from "next";
import AdminShell from "@/components/AdminShell";

export const metadata: Metadata = {
  title: "관리자",
  robots: { index: false, follow: false, noarchive: true },
};

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return <AdminShell>{children}</AdminShell>;
}
