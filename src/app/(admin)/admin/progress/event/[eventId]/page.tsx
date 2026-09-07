import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { isEventUuid } from "@/modules/competitions/events";
import { getRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";

import styles from "../event-admin.module.css";
import { EventAdminActions } from "./event-admin-actions";

export const dynamic = "force-dynamic";
const stages = ["PLANNED", "RECRUITING", "TEAM_BUILDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export default async function AdminEventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await requirePageRole("ADMIN", `/admin/progress/event/${eventId}`);
  if (!isEventUuid(eventId)) notFound();
  const runtime = getRuntimeEvent();
  if (!runtime) return <main className={styles.page}><section className={styles.state} role="status"><h1>이벤트 저장소를 사용할 수 없습니다.</h1></section></main>;
  let event;
  try { event = await runtime.repository.getAdmin(eventId.toLocaleLowerCase("en-US")); } catch { return <main className={styles.page}><section className={styles.state} role="alert"><h1>이벤트를 불러오지 못했습니다.</h1></section></main>; }
  if (!event) notFound();
  const activeCount = event.participants.filter((entry) => entry.status === "ACTIVE").length;
  return <main className={styles.page}><Link href="/admin/progress/event"><ArrowLeft aria-hidden="true" /> 이벤트전 목록</Link><header className={styles.hero}><div><span><Trophy aria-hidden="true" /> {event.settings.format}</span><h1>{event.settings.title}</h1><p>{event.settings.description ?? "설명 없음"}</p></div><Link href={`/competitions/events/${event.id}`}>공개 화면</Link></header>
    <ol className={styles.stages} aria-label="이벤트 진행 단계">{stages.map((stage) => <li className={event.lifecycle.status === stage ? styles.current : undefined} aria-current={event.lifecycle.status === stage ? "step" : undefined} key={stage}>{stage}</li>)}</ol>
    <section className={styles.summary}><article><span>revision</span><strong>{event.revision}</strong></article><article><span>참가자</span><strong>{activeCount}/10</strong></article><article><span>팀</span><strong>{event.teams.length}</strong></article><article><span>대진 결과</span><strong>{event.bracket?.fixtures.filter((fixture) => fixture.result).length ?? 0}/{event.bracket?.fixtures.length ?? 0}</strong></article></section>
    <section className={styles.workspace}><article className={styles.panel}><h2>참가자</h2>{event.participants.length ? event.participants.map((item) => <div className={styles.row} key={item.id}><span>{item.playerId}<br /><small>{item.mainPosition ?? "ARAM"} · {item.source}</small></span><b>{item.status}</b></div>) : <p>아직 참가자가 없습니다.</p>}</article><article className={styles.panel}><h2>팀·대진</h2>{event.teams.map((team) => <div className={styles.row} key={team.id}><span>{team.name}</span><b>{team.members.length}명</b></div>)}{event.bracket?.fixtures.map((fixture) => <div className={styles.row} key={fixture.id}><span>R{fixture.roundNumber} {fixture.teamAId ?? "미정"} vs {fixture.teamBId ?? "미정"}</span><b>{fixture.result ? `${fixture.result.teamAScore}:${fixture.result.teamBScore}` : "대기"}</b></div>) ?? <p>아직 팀·대진이 없습니다.</p>}</article></section>
    <EventAdminActions event={event} />
  </main>;
}
