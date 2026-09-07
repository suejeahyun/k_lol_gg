import Link from "next/link";
import { ArrowLeft, CircleAlert, Database, ShieldCheck } from "lucide-react";
import type { AdminWorkspace } from "@/modules/admin/domain/admin-workspaces";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import styles from "./admin-workspace-page.module.css";

export async function AdminWorkspacePage({ workspace }: { workspace: AdminWorkspace }) {
  await requirePageRole("ADMIN", workspace.href);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> 관리자 메뉴 · {workspace.stage}</span>
          <h1>{workspace.label}</h1>
          <p>{workspace.description}</p>
        </div>
        <span className={styles.foundation}>서비스 준비 중</span>
      </header>

      <section className={styles.empty} aria-labelledby={`${workspace.id}-empty-title`}>
        <div className={styles.emptyIcon}><Database aria-hidden="true" /></div>
        <div>
          <span>현재 상태 · 준비 중</span>
          <h2 id={`${workspace.id}-empty-title`}>이 기능을 준비하고 있습니다.</h2>
          <p>준비가 완료되면 {workspace.scope} 업무를 이곳에서 이용할 수 있습니다.</p>
        </div>
      </section>

      <section className={styles.contract} aria-labelledby={`${workspace.id}-contract-title`}>
        <div>
          <span>이용 안내</span>
          <h2 id={`${workspace.id}-contract-title`}>현재는 사용할 수 없는 기능입니다.</h2>
        </div>
        <ul>
          <li><strong>권한</strong><span>관리자 역할에 따라 사용할 수 있는 메뉴가 달라집니다.</span></li>
          <li><strong>데이터</strong><span>등록된 정보가 없으면 다음 작업을 안내합니다.</span></li>
          <li><strong>오류</strong><span>문제가 발생하면 잠시 후 다시 시도해 주세요.</span></li>
          <li><strong>보안</strong><span>중요한 작업은 권한과 2단계 인증을 다시 확인합니다.</span></li>
        </ul>
      </section>

      <aside className={styles.notice}>
        <CircleAlert aria-hidden="true" />
        <p>준비가 완료되기 전에는 이 영역의 작업을 시작할 수 없습니다.</p>
      </aside>

      <Link className={styles.back} href="/admin"><ArrowLeft aria-hidden="true" /> 관리자 홈으로</Link>
    </main>
  );
}
