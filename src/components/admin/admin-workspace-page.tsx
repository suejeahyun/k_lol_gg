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
          <span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> 보호된 작업 공간 · {workspace.stage}</span>
          <h1>{workspace.label}</h1>
          <p>{workspace.description}</p>
        </div>
        <span className={styles.foundation}>A0 정보구조 연결</span>
      </header>

      <section className={styles.empty} aria-labelledby={`${workspace.id}-empty-title`}>
        <div className={styles.emptyIcon}><Database aria-hidden="true" /></div>
        <div>
          <span>현재 상태 · EMPTY</span>
          <h2 id={`${workspace.id}-empty-title`}>기능 데이터는 아직 연결하지 않았어요.</h2>
          <p>{workspace.scope}의 V1 계약을 데이터 저장소와 연결한 뒤, 합성 데이터로 정상·빈 상태·오류·권한을 각각 검수합니다.</p>
        </div>
      </section>

      <section className={styles.contract} aria-labelledby={`${workspace.id}-contract-title`}>
        <div>
          <span>상태 계약</span>
          <h2 id={`${workspace.id}-contract-title`}>표시만 있는 화면을 완료로 세지 않습니다.</h2>
        </div>
        <ul>
          <li><strong>Loading</strong><span>데이터를 기다리는 동안 구조가 흔들리지 않는 skeleton</span></li>
          <li><strong>Ready / Empty</strong><span>실제 데이터와 다음 행동, 또는 데이터가 없는 이유</span></li>
          <li><strong>Error / Retry</strong><span>안전한 오류 요약과 재시도, 서버 상세 비노출</span></li>
          <li><strong>403 / 404</strong><span>페이지와 mutation API가 같은 역할 정책으로 거부</span></li>
        </ul>
      </section>

      <aside className={styles.notice}>
        <CircleAlert aria-hidden="true" />
        <p>현재는 내비게이션·인증·빈 상태만 구현된 기반 단계입니다. 이 영역의 V1 기능 동등성은 아직 <strong>미완료</strong>입니다.</p>
      </aside>

      <Link className={styles.back} href="/admin"><ArrowLeft aria-hidden="true" /> 관리자 홈으로</Link>
    </main>
  );
}
