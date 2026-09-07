import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Crown, Swords, UsersRound } from "lucide-react";

import { isEventUuid } from "@/modules/competitions/events";
import { getRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";

import styles from "../../events.module.css";
import { EventApplicationActions } from "./event-application-actions";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> { const { eventId } = await params; return { title: "이벤트전 상세", alternates: { canonical: `/competitions/events/${encodeURIComponent(eventId)}` } }; }

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: rawId } = await params;
  if (!isEventUuid(rawId)) notFound();
  const eventId = rawId.toLocaleLowerCase("en-US");
  const runtime = getRuntimeEvent();
  if (!runtime) return <main className={styles.page}><section className={styles.state} role="status"><h1>이벤트전 저장소를 사용할 수 없어요.</h1><p>잠시 후 다시 시도해 주세요.</p></section></main>;
  let event;
  try { event = await runtime.repository.getPublic(eventId, new Date()); } catch { return <main className={styles.page}><section className={styles.state} role="alert"><h1>이벤트전을 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p></section></main>; }
  if (!event) notFound();
  const session = await getCurrentSession("ACCOUNT");
  const own = session ? await runtime.repository.getOwnApplication(eventId, session.userId).catch(() => null) : null;
  return <main className={styles.page}>
    <Link className={styles.back} href="/competitions"><ArrowLeft aria-hidden="true" /> 이벤트전 목록</Link>
    <header className={styles.detailHero}><div><span>{event.format} · {event.status}</span><h1>{event.title}</h1><p>{event.description ?? "즐거운 이벤트전입니다."}</p></div><Swords aria-hidden="true" /></header>
    <section className={styles.facts} aria-label="이벤트전 일정"><article><CalendarDays aria-hidden="true" /><div><span>모집 기간</span><strong>{new Date(event.recruitmentOpensAt).toLocaleString("ko-KR")}<br />~ {new Date(event.recruitmentClosesAt).toLocaleString("ko-KR")}</strong></div></article><article><UsersRound aria-hidden="true" /><div><span>현재 참가자</span><strong>{event.participantCount}/10명</strong></div></article><article><Crown aria-hidden="true" /><div><span>우승 팀</span><strong>{event.winnerTeamName ?? "아직 결정 전"}</strong></div></article></section>
    <EventApplicationActions eventId={event.id} revision={event.revision} format={event.format} open={event.applicationsOpen} signedIn={Boolean(session)} approved={session?.accountStatus === "APPROVED"} application={own} />
    <section className={styles.detailGrid}><article><h2>팀 편성</h2>{event.teams.length ? event.teams.map((team) => <div className={styles.team} key={team.id}><strong>{team.name}</strong><ul>{team.members.map((member) => <li key={member.participantId}><span>{member.position ?? "ARAM"}</span>{member.playerName}</li>)}</ul></div>) : <p>아직 팀을 편성하지 않았어요.</p>}</article><article><h2>대진과 결과</h2>{event.fixtures.length ? event.fixtures.map((fixture) => <div className={styles.fixture} key={fixture.id}><span>ROUND {fixture.roundNumber} · BO{fixture.bestOf}</span><strong>{fixture.teamAName} {fixture.teamAScore ?? "-"} : {fixture.teamBScore ?? "-"} {fixture.teamBName}</strong></div>) : <p>팀 편성 뒤 대진이 공개돼요.</p>}</article></section>
  </main>;
}
