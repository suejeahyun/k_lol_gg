import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import { notFound } from "next/navigation";

import { requireApprovedAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeTeamBalance } from "@/modules/team-tools/infrastructure/runtime-team-balance";

import { TeamBalanceDraftWorkspace } from "./team-balance-draft-workspace";
import styles from "../../../team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "팀 밸런스 초안", robots: { index: false, follow: false } };

export default async function TeamBalanceDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const session = await requireApprovedAccountPage(`/tools/team-balance/drafts/${draftId}`);
  const result = await loadRuntimeTeamBalance((service) => service.getDraft({ actorUserAccountId: session.userId, authorization: "OWNER" }, draftId));
  if (result.state === "ready" && !result.data) notFound();

  return (
    <div className={`page-wrap ${styles.page}`}>
      <Link className={styles.backLink} href="/tools/team-balance/drafts"><ArrowLeft size={16} aria-hidden="true" /> 내 초안 목록</Link>
      {result.state === "ready" && result.data ? (
        <TeamBalanceDraftWorkspace draft={result.data} />
      ) : (
        <section className={styles.emptyState} role={result.state === "error" ? "alert" : "status"}>
          <Scale aria-hidden="true" /><h2>팀 초안을 불러올 수 없어요</h2><p>잠시 후 다시 시도해 주세요.</p>
        </section>
      )}
    </div>
  );
}
