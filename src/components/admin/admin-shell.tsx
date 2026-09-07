import Link from "next/link";
import {
  CloudSun,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import { accountRoleLabel } from "@/modules/accounts/domain/account-display-labels";
import { AdminWorkspaceNavigation, MobileAdminNavigation } from "./admin-navigation";
import { AdminLogoutButton } from "./admin-logout-button";
import styles from "./admin-shell.module.css";

function environmentLabel() {
  if (process.env.VERCEL_ENV === "production") return "PRODUCTION";
  if (process.env.VERCEL_ENV === "preview") return "PREVIEW";
  if (process.env.NODE_ENV === "test") return "TEST";
  return "LOCAL";
}

export function AdminShell({ session, children }: { session: AuthSession; children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} id="admin-workspaces">
        <Link className={styles.brand} href="/admin">
          <span><CloudSun aria-hidden="true" /></span>
          <strong>K-LOL.GG</strong>
        </Link>
        <div className={styles.mode}>
          <ShieldCheck aria-hidden="true" />
          <span>보호된 관리자 공간</span>
        </div>
        <AdminWorkspaceNavigation />
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">{session.role === "SUPER_ADMIN" ? "S" : "A"}</span>
          <span><small>현재 역할</small><strong>{accountRoleLabel(session.role)}</strong></span>
          <AdminLogoutButton />
        </div>
      </aside>
      <div className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}><Link href="/admin">관리자</Link><span aria-hidden="true">/</span><span>보호된 작업 공간</span></div>
          <div className={styles.topActions}>
            <span className={styles.environment}>{environmentLabel()}</span>
            <Link href="/admin/search" aria-label="전체 검색"><Search aria-hidden="true" /><span>전체 검색</span></Link>
            <Link href="/admin/security" aria-label="보안 설정"><ShieldCheck aria-hidden="true" /><span>보안</span></Link>
          </div>
        </header>
        {children}
        <MobileAdminNavigation roleLabel={accountRoleLabel(session.role)} />
      </div>
    </div>
  );
}
