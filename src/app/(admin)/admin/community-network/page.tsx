import Link from "next/link";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeCommunityNetwork } from "@/modules/community-network/infrastructure/runtime";

import NetworkForm from "./network-form";
import styles from "./network.module.css";

export const dynamic = "force-dynamic";

export default async function CommunityNetworkAdminPage() {
  await requirePageRole("SUPER_ADMIN", "/admin/community-network");
  const result = await loadRuntimeCommunityNetwork((repository) => repository.getSnapshot());
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>커뮤니티 연합 허브</p><h1>사이트와 방 관리</h1>
        <p>커뮤니티의 사이트와 카카오톡 방을 등록하고, 모집 정보를 공유할 그룹을 정합니다.</p></div>
      <Link href="/community-network">공개 목록 보기 →</Link>
    </header>
    <aside className={styles.notice}>
      <strong>등록과 실제 연결은 별도입니다.</strong>
      <p>현재는 등록 정보를 관리하는 단계입니다. 방을 추가하거나 사용 여부를 바꿔도 휴대폰 봇 설정과 기존 사이트 데이터는 변경되지 않습니다.</p>
    </aside>
    {result.state === "ready" ? <NetworkForm initial={result.data} />
      : <section className={styles.empty} role="status"><h2>등록 정보를 불러올 수 없습니다</h2>
        <p>{result.state === "disabled" ? "커뮤니티 연결 관리가 아직 활성화되지 않았습니다." : "저장소 연결 상태를 확인한 뒤 다시 시도해 주세요. 저장된 자료가 없다는 뜻은 아닙니다."}</p></section>}
  </main>;
}
