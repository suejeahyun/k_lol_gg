import Link from "next/link";
import { Share2 as Network } from "@/components/theme/theme-icons";
import { AdminLogoutButton } from "@/components/admin/admin-logout-button";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import styles from "./hub.module.css";

export function HubShell({ children, session }: { children: React.ReactNode; session?: AuthSession }) {
  return <div className={styles.shell}>
    <a className={styles.skip} href="#hub-content">본문으로 이동</a>
    <header className={styles.topbar}>
      <div className={styles.topbarInner}>
        <Link className={styles.brand} href="/" aria-label="GG HUB 홈"><span><Network size={22} aria-hidden="true" /></span><strong>GG HUB</strong></Link>
        <span className={styles.serviceLabel}>커뮤니티 중앙 관리</span>
        <nav className={styles.navigation} aria-label="중앙 사이트 메뉴">
          <Link href="/community-network">사이트 둘러보기</Link>
          <Link href="/admin/community-network" className={session ? styles.current : styles.manage}>사이트 관리</Link>
        </nav>
      </div>
    </header>
    {session ? <div className={styles.adminbar}>
      <span><span className={styles.dot} /> 중앙 운영자 공간</span>
      <div><Link href="/account/password?next=%2Fadmin%2Fcommunity-network">비밀번호 변경</Link><span className={styles.role}>{session.role === "SUPER_ADMIN" ? "최고 관리자" : "관리자"}</span><AdminLogoutButton /></div>
    </div> : null}
    <div id="hub-content" className={styles.content} tabIndex={-1}>{children}</div>
    <footer className={styles.footer}><strong>GG HUB</strong><p>각자의 커뮤니티를, 함께 관리하는 공간.</p><Link href="/admin/login">중앙 관리자 로그인</Link></footer>
  </div>;
}
