import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { HubDirectory } from "@/components/hub/hub-directory";

import { loadRuntimeCommunityNetwork } from "@/modules/community-network/infrastructure/runtime";

import styles from "./network-directory.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "커뮤니티 둘러보기", description: "공개된 커뮤니티 소개를 살펴보고 새로운 사이트를 방문하세요.", robots: { index: SERVICE_BRAND.id === "hub", follow: SERVICE_BRAND.id === "hub" }, alternates: { canonical: "/community-network" } };

export default async function CommunityNetworkPage() {
  if (SERVICE_BRAND.id === "hub") return <HubDirectory />;
  const result = await loadRuntimeCommunityNetwork((repository) => repository.getPublicDirectory());
  if (result.state === "disabled") notFound();
  return <main className={styles.page}>
    <header className={styles.header}><p>COMMUNITY NETWORK</p><h1>함께할 커뮤니티를 찾아보세요.</h1><span>공개된 소개를 확인하고 각 커뮤니티 사이트를 방문할 수 있습니다.</span></header>
    {result.state !== "ready" ? <section className={styles.empty} role="status"><h2>목록을 불러오지 못했습니다</h2><p>잠시 후 다시 확인해 주세요.</p></section>
      : result.data.length === 0 ? <section className={styles.empty}><h2>아직 공개된 커뮤니티가 없습니다</h2><p>운영자가 공개한 커뮤니티가 이곳에 표시됩니다.</p></section>
        : <div className={styles.grid}>{result.data.map((community) => <article key={community.id} className={styles.card}>
          <span className={styles.monogram} aria-hidden="true">{Array.from(community.name)[0]}</span><h2>{community.name}</h2>
          <p>{community.description || "등록된 소개가 없습니다."}</p><span className={styles.origin}>{new URL(community.origin).hostname}</span>
          <a href={community.origin} target="_blank" rel="noopener noreferrer">사이트 방문 <span aria-hidden="true">↗</span><span className="sr-only"> (새 창)</span></a>
        </article>)}</div>}
    <p className={styles.note}>사이트 방문과 회원 가입은 별도입니다. 회원·모집·경기 자료는 각 사이트에서 관리합니다.</p>
  </main>;
}
