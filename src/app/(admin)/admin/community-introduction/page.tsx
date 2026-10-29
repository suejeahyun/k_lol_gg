import { notFound } from "next/navigation";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeOperations } from "@/modules/operations/infrastructure/runtime-operations";
import { CommunityIntroductionForm } from "./introduction-form";
import styles from "./introduction-editor.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "커뮤니티 소개 관리", robots: { index: false, follow: false } };

export default async function CommunityIntroductionPage() {
  if (SERVICE_BRAND.id === "hub") notFound();
  await requirePageRole("ADMIN", "/admin/community-introduction");
  const result = await loadRuntimeOperations((repository) => repository.getCommunityIntroduction());
  return <main className={styles.page}>
    <header className={styles.heading}><p>COMMUNITY INTRODUCTION</p><h1>우리 커뮤니티를 소개하세요</h1>
      <span>GG HUB에서 방문자가 볼 상세 소개를 이 사이트에서 관리합니다.</span></header>
    {result.state === "ready" ? <CommunityIntroductionForm initial={result.data} communityName={SERVICE_BRAND.name} />
      : <section className={styles.notice} role="status"><h2>소개를 불러오지 못했습니다</h2><p>잠시 후 다시 확인해 주세요. 저장된 소개가 없다는 뜻은 아닙니다.</p></section>}
  </main>;
}
