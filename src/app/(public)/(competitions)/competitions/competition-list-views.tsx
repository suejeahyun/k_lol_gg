import Link from "next/link";
import { CalendarDays, ChevronRight, Gavel, PartyPopper, Search, Swords, UsersRound } from "lucide-react";

import { publicCompetitionFormatLabel, publicDestructionStatusLabel, publicEventStatusLabel, publicPreliminaryFormatLabel } from "@/modules/competitions/core";
import { DESTRUCTION_PRELIMINARY_FORMATS, DESTRUCTION_PUBLIC_STATUSES, parseDestructionListQuery } from "@/modules/competitions/destruction";
import { loadRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";
import { EVENT_FORMATS, EVENT_PUBLIC_STATUSES, parseEventListQuery } from "@/modules/competitions/events";
import { loadRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";

import styles from "./events.module.css";

type RawSearchParams = Record<string, string | string[] | undefined>;

function inputUrl(pathname: string, raw: RawSearchParams) {
  const url = new URL(`https://v2.invalid${pathname}`);
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, entry));
    else if (typeof value === "string") url.searchParams.set(key, value);
  }
  return url.href;
}

export async function EventCompetitionList({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const query = parseEventListQuery(inputUrl("/competitions/events", await searchParams));
  if (!query) return <CompetitionState error title="이벤트전 목록 주소를 확인해 주세요." description="검색 조건은 한 번씩만 사용할 수 있어요." />;
  const result = await loadRuntimeEvent(({ repository }) => repository.listPublic(query, new Date()));
  return <div className={styles.page} data-competition-kind="event">
    <CompetitionKindNavigation active="event" />
    <header className={styles.hero}><div><span><PartyPopper aria-hidden="true" /> EVENT COMPETITIONS</span><h1>이벤트 대회</h1><p>친선 이벤트의 모집 일정, 팀 편성, 대진과 최종 결과를 확인해요.</p></div><UsersRound aria-hidden="true" /></header>
    <CompetitionFilters action="/competitions/events" query={query.query} status={query.status} format={query.format} statuses={EVENT_PUBLIC_STATUSES.map((status) => ({ value: status, label: publicEventStatusLabel(status) }))} formats={EVENT_FORMATS.map((value) => ({ value, label: publicCompetitionFormatLabel(value) }))} />
    {result.state === "ready" ? result.data.items.length ? <section className={styles.grid} aria-label="이벤트 대회 목록">{result.data.items.map((event) => <Link className={styles.card} href={`/competitions/events/${event.id}`} key={event.id}><header><span data-status={event.status}>{publicEventStatusLabel(event.status)}</span><b>{publicCompetitionFormatLabel(event.format)}</b></header><h2>{event.title}</h2><p>{event.description ?? "즐거운 이벤트 대회가 준비되고 있어요."}</p><dl><div><dt><CalendarDays aria-hidden="true" /> 모집 마감</dt><dd>{new Date(event.recruitmentClosesAt).toLocaleString("ko-KR")}</dd></div><div><dt><UsersRound aria-hidden="true" /> 참가자</dt><dd>{event.participantCount}/10</dd></div></dl><span className={styles.more}>이벤트 상세 <ChevronRight aria-hidden="true" /></span></Link>)}</section> : <CompetitionState title="조건에 맞는 이벤트 대회가 아직 없어요." description="필터를 바꾸거나 새 이벤트 모집을 기다려 주세요." /> : <CompetitionState error title="이벤트 대회 목록을 불러올 수 없어요." description="잠시 후 다시 시도해 주세요." />}
  </div>;
}

export async function DestructionCompetitionList({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const query = parseDestructionListQuery(inputUrl("/competitions/destruction", await searchParams));
  if (!query) return <CompetitionState error title="멸망전 목록 주소를 확인해 주세요." description="검색 조건은 한 번씩만 사용할 수 있어요." />;
  const result = await loadRuntimeDestruction(({ repository }) => repository.listPublic(query));
  return <div className={styles.page} data-competition-kind="destruction">
    <CompetitionKindNavigation active="destruction" />
    <header className={styles.hero}><div><span><Gavel aria-hidden="true" /> DESTRUCTION COMPETITIONS</span><h1>멸망전</h1><p>멸망전 전용 모집, 주장 선정, 경매, 예선과 본선 결과를 확인해요.</p></div><Swords aria-hidden="true" /></header>
    <CompetitionFilters action="/competitions/destruction" query={query.query} status={query.status} format={query.format} statuses={DESTRUCTION_PUBLIC_STATUSES.map((status) => ({ value: status, label: publicDestructionStatusLabel(status) }))} formats={DESTRUCTION_PRELIMINARY_FORMATS.map((value) => ({ value, label: publicPreliminaryFormatLabel(value) }))} />
    {result.state === "ready" ? result.data.items.length ? <section className={styles.grid} aria-label="멸망전 목록">{result.data.items.map((item) => <Link className={styles.card} href={`/competitions/destruction/${item.id}`} key={item.id}><header><span data-status={item.status}>{publicDestructionStatusLabel(item.status)}</span><b>{publicPreliminaryFormatLabel(item.preliminaryFormat)}</b></header><h2>{item.title}</h2><p>{item.teams.length ? `${item.teams.length}개 팀의 멸망전이 진행 중이에요.` : "멸망전 참가자와 주장을 기다리고 있어요."}</p><dl><div><dt><UsersRound aria-hidden="true" /> 참가자</dt><dd>{item.participantCount}명</dd></div><div><dt><Gavel aria-hidden="true" /> 진행 단계</dt><dd>{publicDestructionStatusLabel(item.status)}</dd></div></dl><span className={styles.more}>멸망전 상세 <ChevronRight aria-hidden="true" /></span></Link>)}</section> : <CompetitionState title="조건에 맞는 멸망전이 아직 없어요." description="필터를 바꾸거나 새 멸망전 모집을 기다려 주세요." /> : <CompetitionState error title="멸망전 목록을 불러올 수 없어요." description="잠시 후 다시 시도해 주세요." />}
  </div>;
}

function CompetitionKindNavigation({ active }: { active: "event" | "destruction" }) {
  return <nav className={styles.viewTabs} aria-label="분리된 대회 종류"><Link aria-current={active === "event" ? "page" : undefined} href="/competitions/events">이벤트 대회</Link><Link aria-current={active === "destruction" ? "page" : undefined} href="/competitions/destruction">멸망전</Link></nav>;
}

function CompetitionFilters({ action, query, status, format, statuses, formats }: Readonly<{ action: string; query: string; status: string | null; format: string | null; statuses: readonly Readonly<{ value: string; label: string }>[]; formats: readonly Readonly<{ value: string; label: string }>[] }>) {
  return <form className={styles.filters} action={action} method="get" role="search"><label><span>대회 검색</span><div><Search aria-hidden="true" /><input name="q" defaultValue={query} maxLength={64} placeholder="대회 이름" /></div></label><label><span>상태</span><select name="status" defaultValue={status ?? ""}><option value="">전체 상태</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>방식</span><select name="format" defaultValue={format ?? ""}><option value="">전체 방식</option>{formats.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button type="submit">찾기</button></form>;
}

function CompetitionState({ title, description, error = false }: Readonly<{ title: string; description: string; error?: boolean }>) {
  return <section className={styles.state} role={error ? "alert" : "status"}><PartyPopper aria-hidden="true" /><h2>{title}</h2><p>{description}</p></section>;
}
