import Link from "next/link";
import {
  BarChart3,
  BookOpenCheck,
  CloudSun,
  Gamepad2,
  LayoutDashboard,
  LogOut,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import styles from "./admin-shell.module.css";

const navigation = [
  { label: "대시보드", href: "/admin", icon: LayoutDashboard },
  { label: "계정·선수", href: "/admin#accounts", icon: Users },
  { label: "경기·결과", href: "/admin#matches", icon: Gamepad2 },
  { label: "대회 운영", href: "/admin#tournaments", icon: Trophy },
  { label: "밸런스·통계", href: "/admin#balance", icon: BarChart3 },
  { label: "커뮤니티", href: "/admin#community", icon: Sparkles },
  { label: "징계·자료", href: "/admin#safety", icon: BookOpenCheck },
  { label: "서비스 설정", href: "/admin#operations", icon: Settings2 },
];

export function AdminShell({ session, children }: { session: AuthSession; children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/admin">
          <span><CloudSun aria-hidden="true" /></span>
          <strong>K-LOL.GG <b>V2</b></strong>
        </Link>
        <div className={styles.mode}>
          <ShieldCheck aria-hidden="true" />
          <span>보호된 관리자 공간</span>
        </div>
        <nav aria-label="관리자 메뉴" className={styles.nav}>
          {navigation.map(({ label, href, icon: Icon }) => (
            <Link key={label} href={href}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">{session.role === "SUPER_ADMIN" ? "S" : "A"}</span>
          <span><small>현재 역할</small><strong>{session.role}</strong></span>
          <form action="/api/admin/logout" method="post">
            <button type="submit" aria-label="관리자 로그아웃"><LogOut aria-hidden="true" /></button>
          </form>
        </div>
      </aside>
      <div className={styles.content}>
        <header className={styles.mobileHeader}>
          <Link href="/admin">K-LOL.GG V2 관리자</Link>
          <span>{session.role}</span>
        </header>
        {children}
      </div>
    </div>
  );
}
