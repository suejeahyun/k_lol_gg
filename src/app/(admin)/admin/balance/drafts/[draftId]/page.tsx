import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import { notFound } from "next/navigation";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeTeamBalance } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import { TeamBalanceDraftWorkspace } from "@/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/team-balance-draft-workspace";

import styles from "@/app/(public)/(tools)/tools/team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "팀 밸런스 초안 검수", robots: { index: false, follow: false } };

export default async function AdminTeamBalanceDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const session = await requirePageRole("ADMIN", `/admin/balance/drafts/${draftId}`);
  const result = await loadRuntimeTeamBalance((service) => service.getDraft({ actorUserAccountId: session.userId, authorization: "ADMIN" }, draftId));
  if (result.state === "ready" && !result.data) notFound();
  const draft = result.state === "ready" ? result.data : null;

  return <main className={`page-wrap ${styles.page}`}>
    <Link className={styles.backLink} href="/admin/balance/drafts"><ArrowLeft size={16} aria-hidden="true" /> 전체 초안 목록</Link>
    {draft ? <TeamBalanceDraftWorkspace draft={draft} endpointBase={`/api/admin/team-tools/drafts/${draft.id}`} mode="ADMIN" /> : <section className={styles.emptyState} role={result.state === "error" ? "alert" : "status"}><Scale aria-hidden="true" /><h1>팀 초안을 불러올 수 없습니다.</h1><p>데이터베이스 연결을 확인한 뒤 다시 시도해 주세요.</p></section>}
  </main>;
}
