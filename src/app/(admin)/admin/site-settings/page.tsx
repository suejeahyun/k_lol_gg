import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeOperations } from "@/modules/operations/infrastructure/runtime-operations";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { ssoOrigin } from "@/modules/auth/domain/community-sso";
import Link from "next/link";

import styles from "../operations.module.css";
import SettingsForm from "./settings-form";

export default async function AdminSiteSettingsPage() {
  await requirePageRole("SUPER_ADMIN", "/admin/site-settings");
  const result = await loadRuntimeOperations((repository) => repository.getSiteSettings());
  const managed = SERVICE_BRAND.id === "community";
  let hubSettingsUrl: string | null = null;
  if (managed && SERVICE_BRAND.communityId) {
    try { hubSettingsUrl = `${ssoOrigin(process.env.COMMUNITY_HUB_ORIGIN, process.env.NODE_ENV !== "production")}/sites/${encodeURIComponent(SERVICE_BRAND.communityId)}`; }
    catch { /* The instructions remain visible when the hub connection is unavailable. */ }
  }
  return <main className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>최고 관리자 전용</span><h1>사이트 설정</h1></div></header>
    <section className={styles.state}><h2>GG HUB에 보여줄 상세 소개</h2><p>활동 내용·활동 시간·가입 안내와 공개 여부는 이 사이트의 소개 관리에서 설정합니다. 관리자와 최고 관리자가 편집할 수 있습니다.</p><Link className={styles.link} href="/admin/community-introduction">커뮤니티 소개 관리</Link></section>
    {managed ? <section className={styles.state}><h2>테마와 기능은 GG HUB에서 관리합니다</h2><p>커뮤니티 이름·홈 소개·테마·기능은 소유자의 GG HUB 사이트 설정에서 변경하고 게시해 주세요. 이 화면에서는 지원 URL과 비공개 운영 메모만 저장합니다.</p>{hubSettingsUrl ? <a href={hubSettingsUrl} target="_blank" rel="noopener noreferrer">GG HUB에서 사이트 설정 열기 ↗</a> : <p>GG HUB에 로그인한 뒤 내 사이트에서 이 커뮤니티를 선택해 주세요.</p>}</section> : null}
    {result.state === "unavailable" ? <section className={styles.state}>설정 저장소에 연결할 수 없습니다.</section> : result.state === "error" ? <section className={styles.state}>설정을 읽는 중 오류가 발생했습니다.</section> : <SettingsForm initial={result.data} managed={managed} />}
  </main>;
}
