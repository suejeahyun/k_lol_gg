import type { Metadata } from "next";
import { cache } from "react";
import { BackToList } from "@/components/navigation/list-return";
import { createPublicMetadata, createNoIndexMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, Crown, Sparkles, Swords, UsersRound } from "@/components/theme/theme-icons";

import { isEventUuid, type PublicEventDto } from "@/modules/competitions/events";
import { getRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { parseEventDetailAction } from "@/modules/competitions/public-navigation";
import { publicCompetitionFormatLabel, publicEventStatusLabel } from "@/modules/competitions/core";
import { buildLegacyCanonicalIdDestination } from "@/modules/navigation/application/legacy-user-redirects";
import { parseLegacyIntegerId } from "@/platform/legacy-identifiers";
import { formatKoreanDateTime } from "@/platform/time/format-korean-date-time";
import { ResilientMediaImage } from "@/app/(public)/(media)/resilient-media-image";

import styles from "../../events.module.css";
import { EventApplicationActions } from "./event-application-actions";

export const dynamic = "force-dynamic";
const loadDetail = cache(async (id: string) => getRuntimeEvent()?.repository.getPublic(id, new Date()));
export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId: id } = await params;
  const item = await loadDetail(id).catch(() => null);
  if (!item) return createNoIndexMetadata({ title: "이벤트전 정보 확인", description: "현재 공개 대회 정보를 확인할 수 없습니다." });
  return createPublicMetadata({ title: item.title, description: `이벤트전 · ${item.participantCount}명 참가. 모집과 팀 편성, 경기 결과를 확인하세요.`, canonical: `/competitions/events/${encodeURIComponent(id)}` });
}

const EVENT_STEPS = ["PLANNED", "RECRUITING", "TEAM_BUILDING", "IN_PROGRESS", "COMPLETED"] as const;

function FixtureScore({ fixture }: { fixture: PublicEventDto["fixtures"][number] }) {
  const completed = fixture.winnerTeamId !== null;
  return <div className={styles.fixture} data-complete={completed}><span>{fixture.stage} · ROUND {fixture.roundNumber} · BO{fixture.bestOf}</span><div className={styles.fixtureScore}><strong data-winner={fixture.winnerTeamId !== null && fixture.winnerTeamId === fixture.teamAId}>{fixture.teamAName}</strong><b>{fixture.teamAScore ?? "-"}</b><i>:</i><b>{fixture.teamBScore ?? "-"}</b><strong data-winner={fixture.winnerTeamId !== null && fixture.winnerTeamId === fixture.teamBId}>{fixture.teamBName}</strong></div></div>;
}

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { eventId: rawId } = await params;
  const canonicalId = isEventUuid(rawId);
  const legacyId = canonicalId ? null : parseLegacyIntegerId(rawId);
  if (!canonicalId && legacyId === null) notFound();
  const rawQuery = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(rawQuery)) {
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (typeof value === "string") query.set(key, value);
  }
  const action = parseEventDetailAction(query);
  if (action === undefined) notFound();
  const runtime = getRuntimeEvent();
  if (!runtime) return <div className={styles.page}><section className={styles.state} role="status"><h1>이벤트전 저장소를 사용할 수 없어요.</h1></section></div>;
  if (legacyId !== null) {
    let mappedId;
    try { mappedId = await runtime.repository.resolveLegacyId(legacyId); }
    catch { return <div className={styles.page}><section className={styles.state} role="alert"><h1>이벤트전을 불러오지 못했어요.</h1></section></div>; }
    if (!mappedId) notFound();
    permanentRedirect(buildLegacyCanonicalIdDestination(
      "/competitions/events",
      mappedId,
      "/competitions/events",
      action === "apply" ? { action } : {},
    ));
  }
  const eventId = rawId.toLocaleLowerCase("en-US");
  let event;
  try { event = await loadDetail(eventId); } catch { return <div className={styles.page}><section className={styles.state} role="alert"><h1>이벤트전을 불러오지 못했어요.</h1></section></div>; }
  if (!event) notFound();
  const session = await getCurrentSession("ACCOUNT");
  const own = session ? await runtime.repository.getOwnApplication(eventId, session.userId).catch(() => null) : null;
  return <div className={styles.page}>
    <BackToList className={styles.back} href="/competitions/events"><ArrowLeft aria-hidden="true" /> 이벤트전 목록</BackToList>
    <header className={styles.detailHero} data-kind="event"><div><span className={styles.statusBadge} data-status={event.status}>{publicEventStatusLabel(event.status)}</span><h1>{event.title}</h1>{event.description ? <p>{event.description}</p> : null}</div><Swords aria-hidden="true" /></header>
    {event.status === "CANCELLED" ? <p className={styles.cancelledNotice} role="status">이벤트전 취소 · 참가 신청·경기 종료</p> : <ol className={styles.statusJourney} aria-label="이벤트전 진행 단계">{EVENT_STEPS.map((step, index) => { const current = EVENT_STEPS.indexOf(event.status as (typeof EVENT_STEPS)[number]); return <li data-state={index < current ? "done" : index === current ? "current" : "upcoming"} key={step}>{index < current ? <Check aria-hidden="true" /> : <span>{index + 1}</span>}<strong>{publicEventStatusLabel(step)}</strong></li>; })}</ol>}
    <section className={styles.facts} aria-label="이벤트전 일정"><article><CalendarDays aria-hidden="true" /><div><span>모집 기간</span><strong>{formatKoreanDateTime(event.recruitmentOpensAt)}<br />~ {formatKoreanDateTime(event.recruitmentClosesAt)}</strong></div></article><article><UsersRound aria-hidden="true" /><div><span>현재 참가자</span><strong>{event.participantCount}/10명</strong></div></article><article><Swords aria-hidden="true" /><div><span>경기 방식</span><strong>{publicCompetitionFormatLabel(event.format)} · BO{event.fixtures[0]?.bestOf ?? "-"}</strong></div></article><article><Crown aria-hidden="true" /><div><span>최종 결과</span><strong>{event.winnerTeamName ?? "진행 중"}{event.mvpPlayerName ? ` · MVP ${event.mvpPlayerName}` : ""}</strong></div></article></section>
    <EventApplicationActions eventId={event.id} revision={event.revision} format={event.format} open={event.applicationsOpen} signedIn={Boolean(session)} approved={session?.accountStatus === "APPROVED"} application={own} focusOnMount={action === "apply"} />
    {event.winnerTeamName ? <section className={styles.championCallout} aria-label="이벤트전 최종 결과"><Sparkles aria-hidden="true" /><div><h2>{event.winnerTeamName}</h2>{event.mvpPlayerName ? <p>대회 MVP {event.mvpPlayerName}</p> : null}</div></section> : null}
    <section className={styles.detailGrid}><article><div className={styles.sectionHeading}><div><h2>팀 편성</h2></div><b>{event.teams.length}팀</b></div>{event.teams.length ? <div className={styles.teamGrid}>{event.teams.map((team) => <section className={styles.team} key={team.id}><header><strong>{team.name}</strong>{team.seed ? <span>SEED {team.seed}</span> : null}</header><ul>{team.members.map((member) => <li key={member.participantId}><span>{member.position ?? "ARAM"}</span><Link href={`/players/${member.playerId}`}>{member.playerName}</Link></li>)}</ul></section>)}</div> : <p>아직 팀을 편성하지 않았어요.</p>}</article><article><div className={styles.sectionHeading}><div><h2>대진과 결과</h2></div><b>{event.fixtures.filter((fixture) => fixture.winnerTeamId).length}/{event.fixtures.length}</b></div>{event.fixtures.length ? <div className={styles.fixtureList}>{event.fixtures.map((fixture) => <FixtureScore fixture={fixture} key={fixture.id} />)}</div> : <p>대진 미편성</p>}</article></section>
    {event.gallery ? <section className={styles.eventGallery} aria-labelledby="event-gallery-title"><div className={styles.sectionHeading}><div><h2 id="event-gallery-title">{event.gallery.title}</h2></div><b>{event.gallery.images.length}장</b></div><p>{event.gallery.description}</p><div>{event.gallery.images.map((image, index) => <figure key={image.assetId}><ResilientMediaImage sizes="(max-width: 700px) 100vw, 50vw" src={image.url} alt={`${event.gallery!.title} ${index + 1}번째 이미지`} /></figure>)}</div></section> : null}
  </div>;
}
