import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, PartyPopper, Search, UsersRound } from "lucide-react";

import { EVENT_FORMATS, EVENT_PUBLIC_STATUSES, parseEventListQuery } from "@/modules/competitions/events";
import { loadRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";

import styles from "./events.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "이벤트전", description: "K-LOL.GG 이벤트전의 모집, 팀, 대진과 결과를 확인하세요.", alternates: { canonical: "/competitions" } };

const statusLabel = { PLANNED: "준비 중", RECRUITING: "모집 중", TEAM_BUILDING: "팀 편성", IN_PROGRESS: "진행 중", COMPLETED: "완료", CANCELLED: "취소" } as const;

export default async function CompetitionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const url = new URL("https://v2.invalid/competitions");
  for (const key of ["q", "status", "format", "page", "pageSize"] as const) if (typeof raw[key] === "string") url.searchParams.set(key, raw[key]);
  const query = parseEventListQuery(url.href) ?? { query: "", status: null, format: null, page: 1, pageSize: 12 as const };
  const result = await loadRuntimeEvent(({ repository }) => repository.listPublic(query, new Date()));

  return <div className={styles.page}>
    <header className={styles.hero}><div><span><PartyPopper aria-hidden="true" /> EVENT COMPETITIONS</span><h1>함께 즐기는 이벤트전</h1><p>모집 일정부터 팀 편성, 대진과 최종 결과까지 한눈에 확인해요.</p></div><UsersRound aria-hidden="true" /></header>
    <form className={styles.filters} action="/competitions" method="get" role="search">
      <label><span>이벤트 검색</span><div><Search aria-hidden="true" /><input name="q" defaultValue={query.query} maxLength={64} placeholder="이벤트 이름" /></div></label>
      <label><span>상태</span><select name="status" defaultValue={query.status ?? ""}><option value="">전체 상태</option>{EVENT_PUBLIC_STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
      <label><span>방식</span><select name="format" defaultValue={query.format ?? ""}><option value="">전체 방식</option>{EVENT_FORMATS.map((format) => <option key={format}>{format}</option>)}</select></label>
      <button type="submit">찾기</button>
    </form>
    {result.state === "ready" ? result.data.items.length ? <section className={styles.grid} aria-label="이벤트전 목록">{result.data.items.map((event) => <Link className={styles.card} href={`/competitions/events/${event.id}`} key={event.id}><header><span data-status={event.status}>{statusLabel[event.status]}</span><b>{event.format}</b></header><h2>{event.title}</h2><p>{event.description ?? "즐거운 이벤트전이 준비되고 있어요."}</p><dl><div><dt><CalendarDays aria-hidden="true" /> 모집 마감</dt><dd>{new Date(event.recruitmentClosesAt).toLocaleString("ko-KR")}</dd></div><div><dt><UsersRound aria-hidden="true" /> 참가자</dt><dd>{event.participantCount}/10</dd></div></dl><span className={styles.more}>자세히 보기 <ChevronRight aria-hidden="true" /></span></Link>)}</section> : <section className={styles.state} role="status"><PartyPopper aria-hidden="true" /><h2>조건에 맞는 이벤트전이 아직 없어요.</h2><p>필터를 바꾸거나 새 이벤트 모집을 기다려 주세요.</p></section> : <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><h2>이벤트전 목록을 불러올 수 없어요.</h2><p>잠시 후 다시 시도해 주세요.</p></section>}
  </div>;
}
