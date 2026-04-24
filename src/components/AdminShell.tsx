"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AppTopBar from "./AppTopBar";
import AdminSidebar from "./AdminSidebar";
import AdminLogoutButton from "./AdminLogoutButton";

type AdminShellProps = {
  children: ReactNode;
};

export default function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <AppTopBar
        title="관리자 페이지"
        homeHref="/admin/"
        mode="admin"
      />

      <div className="app-body">
        <AdminSidebar />
        <div className="app-content">{children}</div>
      </div>

      <div className="admin-floating-logout">
        <AdminLogoutButton />
      </div>
    </div>
  );
}