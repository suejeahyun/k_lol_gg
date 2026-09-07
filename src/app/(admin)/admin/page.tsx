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
import { loadRuntimeOperations } from "@/modules/operations/infrastructure/runtime-operations";
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
  const operations = await loadRuntimeOperations((repository) => repository.getDashboard());

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> 관리자 대시보드</span>
          <h1>운영 흐름을 한눈에 정리해요.</h1>
          <p>계정, 경기, 대회와 운영 현황을 한곳에서 관리합니다.</p>
        </div>
        <div className={styles.sessionCard}>
          <small>현재 로그인</small>
          <strong>{accountRoleLabel(session.role)}</strong>
          <span>{session.adminTotpVerified ? "2단계 인증 완료" : "2단계 인증 등록 필요"}</span>
        </div>
      </header>

      <section className={styles.notice} aria-labelledby="admin-foundation-title">
        <div><ShieldCheck aria-hidden="true" /></div>
        <div>
          <h2 id="admin-foundation-title">관리자 보안</h2>
          <p>중요한 작업은 관리자 권한과 2단계 인증을 다시 확인합니다.</p>
        </div>
      </section>

      <section className={styles.notice} aria-labelledby="admin-operations-title">
        <div><BookOpenCheck aria-hidden="true" /></div>
        <div>
          <h2 id="admin-operations-title">운영 상태</h2>
          {operations.state === "unavailable" ? <p>운영 현황을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.</p> : operations.state === "error" ? <p>운영 현황을 읽는 중 오류가 발생했습니다.</p> : <p>계정 {operations.data.accounts} · 활성 플레이어 {operations.data.activePlayers} · 공개 경기 {operations.data.publishedMatches} · 대기 이벤트 {operations.data.pendingOperationsEvents}</p>}
          {session.role === "SUPER_ADMIN" ? <p><Link href="/admin/site-settings">사이트 설정</Link> · <Link href="/admin/logs">감사 로그</Link> · <Link href="/admin/ai-requests">AI 요청 내역</Link></p> : null}
        </div>
      </section>

      <section className={styles.areas} aria-labelledby="admin-areas-title">
        <div className={styles.sectionHeading}>
          <div><span>기능 영역</span><h2 id="admin-areas-title">업무 바로가기</h2></div>
          <p>자주 사용하는 관리 메뉴로 이동하세요.</p>
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
              <span className={styles.pending}>열기</span>
            </Link>
          );})}
        </div>
      </section>
    </main>
  );
}
