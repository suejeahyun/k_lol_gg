import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import { notFound } from "next/navigation";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { readSiteFeatureState } from "@/modules/operations/infrastructure/site-feature-access";
import { loadRuntimeTeamBalance, loadRuntimeTeamBalanceRecommendations } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import { parseTeamBalanceDraftDetailQuery } from "@/modules/team-tools/infrastructure/team-recommendation-query";
import { TeamBalanceDraftWorkspace } from "@/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/team-balance-draft-workspace";
import { TeamBalanceRecommendationsPanel } from "@/app/(public)/(tools)/tools/team-balance/drafts/team-balance-recommendations-panel";
import { TeamBalanceFeatureState } from "@/app/(public)/(tools)/tools/team-balance/team-balance-feature-state";

import styles from "@/app/(public)/(tools)/tools/team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "팀 밸런스 초안 검수", robots: { index: false, follow: false } };

export default async function AdminTeamBalanceDraftPage({ params, searchParams }: { params: Promise<{ draftId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { draftId } = await params;
  const session = await requirePageRole("ADMIN", `/admin/balance/drafts/${draftId}`);
  const featureState = await readSiteFeatureState("teamBalance");
  if (featureState !== "enabled") return <TeamBalanceFeatureState state={featureState} />;
  const query = parseTeamBalanceDraftDetailQuery(await searchParams);
  if (!query) notFound();
  const navigation = <nav className={styles.toolNav} aria-label="관리자 팀 초안 보기"><Link href="/admin/balance/drafts"><ArrowLeft size={16} aria-hidden="true" /> 전체 초안 목록</Link><Link data-active={query.tab === "draft"} href={`/admin/balance/drafts/${draftId}`}>팀 배치</Link><Link data-active={query.tab === "recommendations"} href={`/admin/balance/drafts/${draftId}?tab=recommendations`}>밴픽 추천</Link></nav>;
  if (query.tab === "draft") {
    const result = await loadRuntimeTeamBalance((service) => service.getDraft({ actorUserAccountId: session.userId, authorization: "ADMIN" }, draftId));
    if (result.state === "ready" && !result.data) notFound();
    return <main className={`page-wrap ${styles.page}`}>{navigation}{result.state === "ready" && result.data
      ? <TeamBalanceDraftWorkspace key={`${result.data.evaluationRound}:${result.data.selectedCandidateSignature ?? "none"}`} draft={result.data} endpointBase={`/api/admin/team-tools/drafts/${result.data.id}`} mode="ADMIN"/>
      : <section className={styles.emptyState} role={result.state === "error" ? "alert" : "status"}><Scale aria-hidden="true"/><h1>팀 초안을 불러올 수 없습니다.</h1><p>데이터베이스 연결을 확인한 뒤 다시 시도해 주세요.</p></section>}</main>;
  }
  const result = await loadRuntimeTeamBalanceRecommendations((service) => service.getRecommendation({ actorUserAccountId: session.userId, authorization: "ADMIN" }, draftId, query.team));
  if (result.state === "ready" && !result.data) notFound();
  return <main className={`page-wrap ${styles.page}`}>{navigation}{result.state === "ready" && result.data
    ? <><section className={styles.draftHeader}><div><span>ADMIN PICK · BAN</span><h1>{result.data.draft.title}</h1><p>소유자를 가장하지 않는 관리자 읽기 전용 추천</p></div><strong>{result.data.team}</strong></section><TeamBalanceRecommendationsPanel recommendation={result.data} hrefForTeam={(team) => `/admin/balance/drafts/${draftId}?tab=recommendations&team=${team}`}/></>
    : <section className={styles.emptyState} role={result.state === "error" ? "alert" : "status"}><Scale aria-hidden="true"/><h1>밴픽 추천을 불러올 수 없습니다.</h1><p>데이터베이스 연결을 확인한 뒤 다시 시도해 주세요.</p></section>}</main>;
}
