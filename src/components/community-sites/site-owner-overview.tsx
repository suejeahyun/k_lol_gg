"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, Plus, Search, CircleAlert, AppWindow, CheckCircle2 } from "@/components/theme/theme-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CommunitySite } from "@/modules/community-sites/domain/community-site";
import { communitySiteOwnerGuidance } from "@/modules/community-sites/domain/owner-guidance";
import { COMMUNITY_TEMPLATES } from "@/modules/community-sites/domain/site-configuration";
import { COMMUNITY_SITE_STATUS_LABELS, SITE_OVERVIEW_FILTERS, communitySiteNeedsAttention, filterOwnedCommunitySites, matchesSiteOverviewFilter, type SiteOverviewFilter } from "@/modules/community-sites/domain/site-overview";
import styles from "./site-owner-overview.module.css";

const time = (value: string) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));

export function SiteOwnerOverview({ sites }: { sites: readonly CommunitySite[] }) {
  const id = useId();
  const [filter, setFilter] = useState<SiteOverviewFilter>("all");
  const [query, setQuery] = useState("");
  const filtered = filterOwnedCommunitySites(sites, filter, query);
  const counts = Object.fromEntries(SITE_OVERVIEW_FILTERS.map(item => [item.id, sites.filter(site => matchesSiteOverviewFilter(site, item.id)).length]));
  const summaries = [{ id: "all", title: "내 사이트", detail: "신청부터 운영까지", icon: AppWindow }, { id: "attention", title: "확인할 일", detail: "보완·공개 확인·작업 확인", icon: CircleAlert }, { id: "active", title: "운영 중", detail: "공개가 완료된 사이트", icon: CheckCircle2 }] as const;
  return <div className={styles.overview}>
    {sites.length > 0 ? <><div className={styles.summary} aria-label="내 사이트 현황">{summaries.map(item => <button type="button" key={item.id} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={styles.summaryCard} data-kind={item.id}>
      <span><item.icon size={18} aria-hidden="true" />{item.title}</span><strong>{counts[item.id].toLocaleString("ko-KR")}</strong><small>{item.detail}<ArrowRight size={15} aria-hidden="true" /></small>
    </button>)}</div>
    <p className={styles.dataNote}>현재 불러온 신청·개설 상태입니다. 실시간 접속 상태를 뜻하지 않으며, 운영 중인 사이트에도 확인할 일이 있을 수 있습니다.</p></> : null}
    {sites.length === 0 ? <section className={styles.welcome}><div className={styles.welcomeIcon}><Plus size={28} aria-hidden="true" /></div><p>YOUR FIRST COMMUNITY</p><h2>함께할 공간을 만들어 보세요.</h2><span>세 가지 테마 중 마음에 드는 구성을 고르세요.<br />이름·소개·기능을 정하면 첫 신청을 시작할 수 있습니다.</span><Link href="/sites/new">첫 사이트 만들기 <ArrowRight size={17} aria-hidden="true" /></Link><small>신청 → GG HUB 검토 → 사이트 확인 → 운영 시작</small></section> : <>
      <section aria-label="사이트 검색과 상태 필터" className={styles.toolbar}>
        <div className={styles.search}><Search size={18} aria-hidden="true" /><label htmlFor={id} className={styles.srOnly}>내 사이트 검색</label><Input id={id} type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="사이트 이름·소개·주소 검색" aria-describedby={`${id}-result`} /></div>
        <div className={styles.filters} aria-label="사이트 상태">{SITE_OVERVIEW_FILTERS.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{counts[item.id]}</span></button>)}</div>
      </section>
      <div className={styles.results}><p id={`${id}-result`} role="status">{SITE_OVERVIEW_FILTERS.find(item => item.id === filter)!.label} · {filtered.length}개 사이트</p><span>확인할 일 우선 · 최근 변경순</span>{query || filter !== "all" ? <Button type="button" variant="ghost" onClick={() => { setQuery(""); setFilter("all"); }}>조건 초기화</Button> : null}</div>
      <section className={styles.grid} aria-label="내 사이트 목록">{filtered.map(site => {
        const attention = communitySiteNeedsAttention(site);
        const guidance = communitySiteOwnerGuidance(site);
        const template = COMMUNITY_TEMPLATES.find(item => item.id === site.configuration.templateId)!;
        return <article key={site.id} className={styles.card} data-template={template.id}>
          <div className={styles.cardHeader}><div className={styles.mark} aria-hidden="true">{Array.from(site.configuration.name)[0]}</div><div><span className={styles.template}>{template.name} 테마</span><h2><Link href={`/sites/${site.id}`}>{site.configuration.name}</Link></h2></div><span className={styles.badge} data-attention={attention}>{COMMUNITY_SITE_STATUS_LABELS[site.status]}</span></div>
          <p className={styles.description}>{site.configuration.description || "소개를 추가해 우리 커뮤니티를 알려 주세요."}</p>
          <div className={styles.nextStep} data-attention={attention}><span>{attention ? <CircleAlert size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}{attention ? "지금 확인해 주세요" : "다음 단계"}</span><p>{guidance.title}</p></div>
          <div className={styles.cardFoot}><small>최근 변경 <time dateTime={site.updatedAt}>{time(site.updatedAt)}</time></small><div><Link href={`/sites/${site.id}`} aria-label={`${site.configuration.name} 설정과 진행 상태`}>설정과 진행 상태 <ArrowRight size={16} aria-hidden="true" /></Link>{site.origin && ["ACTIVE", "AWAITING_OWNER", "ACTIVATING"].includes(site.status) ? <a href={site.origin} target="_blank" rel="noopener noreferrer" aria-label={`${site.configuration.name} 사이트 방문 (새 창)`}>사이트 방문 <ExternalLink size={15} aria-hidden="true" /></a> : null}</div></div>
        </article>;
      })}</section>
      {filtered.length === 0 ? <div className={styles.noResults}><Search size={24} aria-hidden="true" /><h2>조건에 맞는 사이트가 없습니다.</h2><p>다른 이름을 검색하거나 상태 필터를 바꿔 주세요.</p><Button type="button" variant="outline" onClick={() => { setQuery(""); setFilter("all"); }}>모든 사이트 보기</Button></div> : null}
    </>}
    <aside className={styles.help}><div><strong>운영하다 막히는 부분이 있나요?</strong><p>진행이 멈췄거나 설정이 어렵다면 운영팀에 알려 주세요.</p></div><Link href="/help/contact">도움·문의 <ArrowRight size={16} aria-hidden="true" /></Link></aside>
  </div>;
}
