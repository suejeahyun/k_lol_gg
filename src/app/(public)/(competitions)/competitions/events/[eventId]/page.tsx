import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, Crown, Sparkles, Swords, UsersRound } from "lucide-react";

import { isEventUuid, type PublicEventDto } from "@/modules/competitions/events";
import { getRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { parseEventDetailAction } from "@/modules/competitions/public-navigation";
import { formatKoreanDateTime } from "@/platform/time/format-korean-date-time";

import styles from "../../events.module.css";
import { EventApplicationActions } from "./event-application-actions";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> { const { eventId } = await params; return { title: "이벤트전 상세", alternates: { canonical: `/competitions/events/${encodeURIComponent(eventId)}` } }; }

const EVENT_STEPS = ["PLANNED", "RECRUITING", "TEAM_BUILDING", "IN_PROGRESS", "COMPLETED"] as const;
const EVENT_STATUS_LABEL = { PLANNED: "준비", RECRUITING: "참가 모집", TEAM_BUILDING: "팀 편성", IN_PROGRESS: "경기 진행", COMPLETED: "완료", CANCELLED: "취소" } as const;

function FixtureScore({ fixture }: { fixture: PublicEventDto["fixtures"][number] }) {
  const completed = fixture.winnerTeamId !== null;
  return <div className={styles.fixture} data-complete={completed}><span>{fixture.stage} · ROUND {fixture.roundNumber} · BO{fixture.bestOf}</span><div className={styles.fixtureScore}><strong data-winner={fixture.winnerTeamId !== null && fixture.winnerTeamId === fixture.teamAId}>{fixture.teamAName}</strong><b>{fixture.teamAScore ?? "-"}</b><i>:</i><b>{fixture.teamBScore ?? "-"}</b><strong data-winner={fixture.winnerTeamId !== null && fixture.winnerTeamId === fixture.teamBId}>{fixture.teamBName}</strong></div></div>;
}

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { eventId: rawId } = await params;
  if (!isEventUuid(rawId)) notFound();
  const rawQuery = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(rawQuery)) {
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (typeof value === "string") query.set(key, value);
  }
  const action = parseEventDetailAction(query);
  if (action === undefined) notFound();
  const eventId = rawId.toLocaleLowerCase("en-US");
  const runtime = getRuntimeEvent();
  if (!runtime) return <div className={styles.page}><section className={styles.state} role="status"><h1>이벤트전 저장소를 사용할 수 없어요.</h1><p>잠시 후 다시 시도해 주세요.</p></section></div>;
  let event;
  try { event = await runtime.repository.getPublic(eventId, new Date()); } catch { return <div className={styles.page}><section className={styles.state} role="alert"><h1>이벤트전을 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p></section></div>; }
  if (!event) notFound();
  const session = await getCurrentSession("ACCOUNT");
  const own = session ? await runtime.repository.getOwnApplication(eventId, session.userId).catch(() => null) : null;
  return <div className={styles.page}>
    <Link className={styles.back} href="/competitions"><ArrowLeft aria-hidden="true" /> 이벤트전 목록</Link>
    <header className={styles.detailHero} data-kind="event"><div><span className={styles.statusBadge} data-status={event.status}>{EVENT_STATUS_LABEL[event.status]}</span><p className={styles.heroKicker}>{event.format === "POSITION" ? "포지션 기반 이벤트전" : "칼바람 이벤트전"}</p><h1>{event.title}</h1><p>{event.description ?? "즐거운 이벤트전입니다."}</p></div><Swords aria-hidden="true" /></header>
    {event.status === "CANCELLED" ? <p className={styles.cancelledNotice} role="status">이 이벤트전은 취소되었습니다. 참가 신청과 경기 진행은 종료됐어요.</p> : <ol className={styles.statusJourney} aria-label="이벤트전 진행 단계">{EVENT_STEPS.map((step, index) => { const current = EVENT_STEPS.indexOf(event.status as (typeof EVENT_STEPS)[number]); return <li data-state={index < current ? "done" : index === current ? "current" : "upcoming"} key={step}>{index < current ? <Check aria-hidden="true" /> : <span>{index + 1}</span>}<strong>{EVENT_STATUS_LABEL[step]}</strong></li>; })}</ol>}
    <section className={styles.facts} aria-label="이벤트전 일정"><article><CalendarDays aria-hidden="true" /><div><span>모집 기간</span><strong>{formatKoreanDateTime(event.recruitmentOpensAt)}<br />~ {formatKoreanDateTime(event.recruitmentClosesAt)}</strong></div></article><article><UsersRound aria-hidden="true" /><div><span>현재 참가자</span><strong>{event.participantCount}/10명</strong></div></article><article><Swords aria-hidden="true" /><div><span>경기 방식</span><strong>{event.format === "POSITION" ? "포지션 드래프트" : "ARAM"} · BO{event.fixtures[0]?.bestOf ?? "-"}</strong></div></article><article><Crown aria-hidden="true" /><div><span>최종 결과</span><strong>{event.winnerTeamName ?? "진행 중"}{event.mvpPlayerName ? ` · MVP ${event.mvpPlayerName}` : ""}</strong></div></article></section>
    <EventApplicationActions eventId={event.id} revision={event.revision} format={event.format} open={event.applicationsOpen} signedIn={Boolean(session)} approved={session?.accountStatus === "APPROVED"} application={own} focusOnMount={action === "apply"} />
    {event.winnerTeamName ? <section className={styles.championCallout} aria-label="이벤트전 최종 결과"><Sparkles aria-hidden="true" /><div><span>EVENT CHAMPION</span><h2>{event.winnerTeamName}</h2><p>{event.mvpPlayerName ? `대회 MVP ${event.mvpPlayerName}` : "참가한 모든 선수에게 박수를 보내요."}</p></div></section> : null}
    <section className={styles.detailGrid}><article><div className={styles.sectionHeading}><div><span>ROSTERS</span><h2>팀 편성</h2></div><b>{event.teams.length}팀</b></div>{event.teams.length ? <div className={styles.teamGrid}>{event.teams.map((team) => <section className={styles.team} key={team.id}><header><strong>{team.name}</strong>{team.seed ? <span>SEED {team.seed}</span> : null}</header><ul>{team.members.map((member) => <li key={member.participantId}><span>{member.position ?? "ARAM"}</span><Link href={`/players/${member.playerId}`}>{member.playerName}</Link></li>)}</ul></section>)}</div> : <p>아직 팀을 편성하지 않았어요.</p>}</article><article><div className={styles.sectionHeading}><div><span>BRACKET</span><h2>대진과 결과</h2></div><b>{event.fixtures.filter((fixture) => fixture.winnerTeamId).length}/{event.fixtures.length}</b></div>{event.fixtures.length ? <div className={styles.fixtureList}>{event.fixtures.map((fixture) => <FixtureScore fixture={fixture} key={fixture.id} />)}</div> : <p>팀 편성 뒤 대진이 공개돼요.</p>}</article></section>
  </div>;
}
