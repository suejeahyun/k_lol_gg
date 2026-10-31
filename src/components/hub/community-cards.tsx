"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink as ArrowUpRight } from "@/components/theme/theme-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HubPublicCommunity } from "@/modules/community-network/infrastructure/hub-community-directory";
import styles from "./hub.module.css";

export function filterCommunities(communities: readonly HubPublicCommunity[], query: string) {
  const terms = query.normalize("NFKC").toLocaleLowerCase("ko-KR").trim().split(/\s+/u).filter(Boolean);
  return communities.filter((community) => {
    const content = `${community.name} ${community.description} ${new URL(community.origin).hostname}`.normalize("NFKC").toLocaleLowerCase("ko-KR");
    return terms.every((term) => content.includes(term));
  });
}

export function CommunityCards({ communities }: { communities: readonly HubPublicCommunity[] }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const filtered = filterCommunities(communities, query);
  return <>
    <div className={styles.search} role="search" aria-label="등록된 커뮤니티 검색">
      <label htmlFor={id}>커뮤니티 찾기</label>
      <Input id={id} type="search" value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} placeholder="이름·소개·사이트 주소로 검색" aria-describedby={`${id}-result`} />
      {query ? <Button type="button" variant="outline" onClick={() => setQuery("")}>검색 초기화</Button> : null}
    </div>
    <p id={`${id}-result`} className={styles.searchResult} role="status" aria-live="polite">{query.trim() ? `검색 결과 ${filtered.length}개 / 등록된 사이트 ${communities.length}개` : `등록된 사이트 ${communities.length}개를 둘러보세요.`}</p>
    {filtered.length === 0 ? <div className={styles.empty}><h3>검색 결과가 없습니다</h3><p>다른 이름이나 짧은 검색어를 입력해 보세요.</p></div>
      : <div className={styles.grid}>{filtered.map((community) => <article key={community.id} className={styles.siteCard}>
        <div className={styles.cardTop}><span className={styles.monogram} aria-hidden="true">{Array.from(community.name)[0]}</span><span className={styles.siteType}>독립 커뮤니티</span></div>
        <h3>{community.name}</h3><p className={styles.siteDescription}>{community.description || "사이트에서 커뮤니티의 활동과 소식을 확인해 보세요."}</p>
        <span className={styles.origin}>{new URL(community.origin).hostname}</span>
        <div className={styles.cardActions}><Link href={`/community-network/${community.id}`} aria-label={`${community.name} 소개 보기`}>소개 보기<ArrowRight size={17} aria-hidden="true" /></Link>
          <a href={community.origin} target="_blank" rel="noopener noreferrer" aria-label={`${community.name} 사이트 방문 (새 창)`}>사이트 방문<ArrowUpRight size={17} aria-hidden="true" /></a></div>
      </article>)}</div>}
  </>;
}
