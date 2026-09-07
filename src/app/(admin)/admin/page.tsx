import Link from "next/link";
import {
  BookOpenCheck,
  Bot,
  CalendarDays,
  Gamepad2,
  MessageCircleMore,
  Scale,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { ADMIN_WORKSPACES, type AdminWorkspaceIconKey } from "@/modules/admin/domain/admin-workspaces";
import { accountRoleLabel } from "@/modules/accounts/domain/account-display-labels";
import styles from "./page.module.css";

const icons = {
  people: Users,
  seasons: CalendarDays,
  matches: Gamepad2,
  balance: Scale,
  tournaments: Trophy,
  community: MessageCircleMore,
  content: Sparkles,
  integrations: Bot,
  operations: BookOpenCheck,
} satisfies Partial<Record<AdminWorkspaceIconKey, typeof Users>>;

const areas = ADMIN_WORKSPACES.filter((workspace) => workspace.id !== "home");

export default async function AdminDashboardPage() {
  const session = await requirePageRole("ADMIN", "/admin");

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> 관리자 기반 S01</span>
          <h1>운영 흐름을 한눈에 정리해요.</h1>
          <p>V1의 81개 관리자 화면을 기능 계약별로 통합하는 V2 운영 허브입니다.</p>
        </div>
        <div className={styles.sessionCard}>
          <small>검증된 세션</small>
          <strong>{accountRoleLabel(session.role)}</strong>
          <span>{session.adminTotpVerified ? "2단계 인증 완료" : "2단계 인증 등록 필요"}</span>
        </div>
      </header>

      <section className={styles.notice} aria-labelledby="admin-foundation-title">
        <div><ShieldCheck aria-hidden="true" /></div>
        <div>
          <h2 id="admin-foundation-title">로그인을 우회하지 않는 검수 기반</h2>
          <p>현재 화면도 비밀번호·TOTP·서명된 HttpOnly 세션을 통과해야 열립니다. 각 운영 기능은 구현될 때 페이지와 API에서 권한을 다시 확인합니다.</p>
        </div>
      </section>

      <section className={styles.areas} aria-labelledby="admin-areas-title">
        <div className={styles.sectionHeading}>
          <div><span>기능 영역</span><h2 id="admin-areas-title">관리자 구현 지도</h2></div>
          <p>완성된 영역만 실제 작업 버튼을 활성화합니다.</p>
        </div>
        <div className={styles.grid}>
          {areas.map((workspace) => {
            const Icon = icons[workspace.icon] ?? ShieldCheck;
            return (
            <Link href={workspace.href} id={workspace.id} className={styles.areaCard} key={workspace.id}>
              <div className={styles.icon}><Icon aria-hidden="true" /></div>
              <span className={styles.stage}>{workspace.stage}</span>
              <h3>{workspace.label}</h3>
              <p>{workspace.description}</p>
              <span className={styles.pending}>기반 화면 열기</span>
            </Link>
          );})}
        </div>
      </section>
    </main>
  );
}
