import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import { notFound } from "next/navigation";

import { requireApprovedAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { readSiteFeatureState } from "@/modules/operations/infrastructure/site-feature-access";
import { loadRuntimeTeamBalance, loadRuntimeTeamBalanceRecommendations } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import { parseTeamBalanceDraftDetailQuery } from "@/modules/team-tools/infrastructure/team-recommendation-query";

import { TeamBalanceDraftWorkspace } from "./team-balance-draft-workspace";
import { TeamBalanceRecommendationsPanel } from "../team-balance-recommendations-panel";
import { TeamBalanceFeatureState } from "../../team-balance-feature-state";
import { TeamToolNav } from "../../../team-tool-nav";
import styles from "../../../team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "팀 밸런스 초안", robots: { index: false, follow: false } };

export default async function TeamBalanceDraftPage({ params, searchParams }: { params: Promise<{ draftId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { draftId } = await params;
  const session = await requireApprovedAccountPage(`/tools/team-balance/drafts/${draftId}`);
  const featureState = await readSiteFeatureState("teamBalance");
  if (featureState !== "enabled") return <TeamBalanceFeatureState state={featureState} />;
  const query = parseTeamBalanceDraftDetailQuery(await searchParams);
  if (!query) notFound();
  const navigation = <nav className={styles.toolNav} aria-label="팀 초안 보기"><Link href="/tools/team-balance/drafts"><ArrowLeft size={16} aria-hidden="true" /> 초안 목록</Link><Link data-active={query.tab === "draft"} href={`/tools/team-balance/drafts/${draftId}`}>팀 배치</Link><Link data-active={query.tab === "recommendations"} href={`/tools/team-balance/drafts/${draftId}?tab=recommendations`}>밴픽 추천</Link></nav>;
  if (query.tab === "draft") {
    const result = await loadRuntimeTeamBalance((service) => service.getDraft({ actorUserAccountId: session.userId, authorization: "OWNER" }, draftId));
    if (result.state === "ready" && !result.data) notFound();
    return <div className={`page-wrap ${styles.page}`}><TeamToolNav current="drafts" approved />{navigation}{result.state === "ready" && result.data
      ? <TeamBalanceDraftWorkspace key={`${result.data.evaluationRound}:${result.data.selectedCandidateSignature ?? "none"}`} draft={result.data}/>
      : <section className={styles.emptyState} role={result.state === "error" ? "alert" : "status"}><Scale aria-hidden="true"/><h1>팀 초안을 불러올 수 없어요</h1><p>잠시 후 다시 시도해 주세요.</p></section>}</div>;
  }
  const result = await loadRuntimeTeamBalanceRecommendations((service) => service.getRecommendation({ actorUserAccountId: session.userId, authorization: "OWNER" }, draftId, query.team));
  if (result.state === "ready" && !result.data) notFound();
  return <div className={`page-wrap ${styles.page}`}><TeamToolNav current="drafts" approved />{navigation}{result.state === "ready" && result.data
    ? <><section className={styles.draftHeader}><div><span>PICK · BAN</span><h1>{result.data.draft.title}</h1><p>선택·저장된 팀 배치 기반 챔피언 추천</p></div><strong>{result.data.team}</strong></section><TeamBalanceRecommendationsPanel recommendation={result.data} hrefForTeam={(team) => `/tools/team-balance/drafts/${draftId}?tab=recommendations&team=${team}`}/></>
    : <section className={styles.emptyState} role={result.state === "error" ? "alert" : "status"}><Scale aria-hidden="true"/><h1>밴픽 추천을 불러올 수 없어요</h1><p>잠시 후 다시 시도해 주세요.</p></section>}</div>;
}
