import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Crown, Gavel, Images, Sparkles, Swords, UsersRound, X } from "lucide-react";

import { ResilientMediaImage } from "@/app/(public)/(media)/resilient-media-image";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { isDestructionUuid, type DestructionPublicDto } from "@/modules/competitions/destruction";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";
import { parseDestructionDetailView } from "@/modules/competitions/public-navigation";

import styles from "../../events.module.css";
import { DestructionOwnerActions } from "./destruction-owner-actions";

export const dynamic = "force-dynamic";

const DESTRUCTION_STEPS = ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT", "COMPLETED"] as const;
const DESTRUCTION_STATUS_LABEL = { PLANNED: "준비", RECRUITING: "참가 모집", TEAM_BUILDING: "주장 선정", AUCTION: "경매", PRELIMINARY: "예선", TOURNAMENT: "본선", COMPLETED: "완료", CANCELLED: "취소" } as const;
const PRELIMINARY_LABEL: Record<string, string> = { FULL_ROUND_ROBIN_BO3: "전체 풀리그", FULL_ROUND_ROBIN_BO1: "전체 풀리그", GROUP_ROUND_ROBIN_BO3: "조별 풀리그", GROUP_ROUND_ROBIN_BO1: "조별 풀리그", SWISS_ROUND_BO3: "스위스 라운드", SWISS_ROUND_BO1: "스위스 라운드", RANDOM_ROUNDS_BO3: "랜덤 라운드", RANDOM_ROUNDS_BO1: "랜덤 라운드" };

export async function generateMetadata({ params }: { params: Promise<{ tournamentId: string }> }): Promise<Metadata> {
  const { tournamentId } = await params;
  return { title: "멸망전 상세", alternates: { canonical: `/competitions/destruction/${encodeURIComponent(tournamentId)}` } };
}

function queryFromRaw(raw: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (typeof value === "string") query.set(key, value);
  }
  return query;
}

export default async function DestructionDetailPage({ params, searchParams }: { params: Promise<{ tournamentId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tournamentId: rawId } = await params;
  if (!isDestructionUuid(rawId)) notFound();
  const view = parseDestructionDetailView(queryFromRaw(await searchParams));
  if (!view) notFound();
  const tournamentId = rawId.toLocaleLowerCase("en-US");
  const runtime = getRuntimeDestruction();
  if (!runtime) return <div className={styles.page}><section className={styles.state} role="status"><h1>멸망전 정보를 확인할 수 없어요.</h1><p>잠시 후 다시 확인해 주세요.</p></section></div>;
  let destruction;
  try { destruction = await runtime.repository.getPublic(tournamentId); }
  catch { return <div className={styles.page}><section className={styles.state} role="alert"><h1>멸망전을 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p></section></div>; }
  if (!destruction) notFound();
  const selectedPlayer = view.playerId === null ? null : destruction.teams.flatMap((team) => team.rosterPlayers.map((player) => ({ ...player, teamName: team.name }))).find((player) => player.playerId === view.playerId || player.participantId === view.playerId);
  if (view.playerId !== null && !selectedPlayer) notFound();
  const selectedImage = view.imageIndex === null ? null : destruction.gallery?.images[view.imageIndex];
  if (view.imageIndex !== null && !selectedImage) notFound();

  const session = await getCurrentSession("ACCOUNT");
  const [own, ownMvpBallots] = session?.accountStatus === "APPROVED" ? await Promise.all([
    runtime.repository.getOwnApplication(tournamentId, session.userId).catch(() => null),
    runtime.repository.getOwnMvpBallots(tournamentId, session.userId).catch(() => []),
  ]) : [null, []];
  const participantCount = destruction.teams.reduce((count, team) => count + team.rosterPlayerIds.length, 0);

  return <div className={styles.page}>
    <Link className={styles.back} href="/competitions?type=destruction"><ArrowLeft aria-hidden="true" /> 멸망전 목록</Link>
    <header className={styles.detailHero} data-kind="destruction"><div><span className={styles.statusBadge} data-status={destruction.status}>{DESTRUCTION_STATUS_LABEL[destruction.status]}</span><p className={styles.heroKicker}>AUCTION TOURNAMENT</p><h1>{destruction.title}</h1><p>모집, 주장 선정, 경매, 예선과 본선 결과를 한 화면에서 확인하세요.</p></div><Gavel aria-hidden="true" /></header>
    {destruction.status === "CANCELLED" ? <p className={styles.cancelledNotice} role="status">이 멸망전은 취소되었습니다. 신청과 운영 작업은 종료됐어요.</p> : <ol className={styles.statusJourney} aria-label="멸망전 진행 단계">{DESTRUCTION_STEPS.map((step, index) => { const current = DESTRUCTION_STEPS.indexOf(destruction.status as (typeof DESTRUCTION_STEPS)[number]); return <li data-state={index < current ? "done" : index === current ? "current" : "upcoming"} key={step}>{index < current ? <Check aria-hidden="true" /> : <span>{index + 1}</span>}<strong>{DESTRUCTION_STATUS_LABEL[step]}</strong></li>; })}</ol>}
    <section className={styles.facts} aria-label="멸망전 요약">
      <article><UsersRound aria-hidden="true" /><div><span>팀·확정 로스터</span><strong>{destruction.teams.length}팀 · {participantCount}명</strong></div></article>
      <article><Swords aria-hidden="true" /><div><span>예선 방식</span><strong>{PRELIMINARY_LABEL[destruction.preliminaryFormat] ?? "예선"} · BO{destruction.preliminaryBestOf}</strong></div></article>
      <article><Sparkles aria-hidden="true" /><div><span>본선 진출</span><strong>상위 {destruction.advanceTeamCount}팀</strong></div></article>
      <article><Crown aria-hidden="true" /><div><span>우승 팀</span><strong>{destruction.championTeamName ?? "아직 결정 전"}</strong></div></article>
    </section>
    <nav className={styles.detailTabs} aria-label="멸망전 상세 메뉴">
      <Link aria-current={view.tab === "overview" ? "page" : undefined} href={`/competitions/destruction/${destruction.id}`}>대회 현황</Link>
      <Link aria-current={view.tab === "captain-points" ? "page" : undefined} href={`?tab=captain-points`}>주장 포인트 <small>{destruction.teams.length}</small></Link>
      <Link aria-current={view.tab === "participants" ? "page" : undefined} href={`?tab=participants`}>참가 선수 <small>{participantCount}</small></Link>
      <Link aria-current={view.tab === "gallery" ? "page" : undefined} href={`?tab=gallery`}>갤러리 <small>{destruction.gallery?.images.length ?? 0}</small></Link>
      <Link aria-current={view.tab === "mvp" ? "page" : undefined} href={`?tab=mvp`}>MVP <small>{destruction.mvpResults.length}</small></Link>
    </nav>
    <DestructionOwnerActions tournamentId={destruction.id} revision={destruction.revision} status={destruction.status} signedIn={Boolean(session)} approved={session?.accountStatus === "APPROVED"} application={own} mvpBallots={ownMvpBallots} focusTarget={view.action === "apply" ? "apply" : view.tab === "mvp" ? "mvp" : null} />
    {view.tab === "overview" ? <Overview destruction={destruction} /> : null}
    {view.tab === "captain-points" ? <section className={styles.tabPanel} aria-labelledby="captain-points-title"><h2 id="captain-points-title">주장별 경매 포인트</h2>{destruction.teams.length ? <div className={styles.pointGrid}>{destruction.teams.map((team) => <article key={team.id}><strong>{team.name}</strong><span>주장 {team.captainPlayerName ?? "선정 전"}</span><b>{team.remainingAuctionPoints}P</b><small>시작 {team.initialAuctionPoints}P · 사용 {team.initialAuctionPoints - team.remainingAuctionPoints}P</small></article>)}</div> : <p>주장 선정 뒤 포인트가 공개돼요.</p>}</section> : null}
    {view.tab === "participants" ? <section className={styles.tabPanel} aria-labelledby="participants-title"><h2 id="participants-title">참가 선수</h2>{selectedPlayer ? <article className={styles.selectedPlayer} tabIndex={-1} autoFocus role="region" aria-label={`${selectedPlayer.playerName} 선수 상세`}><span>{selectedPlayer.teamName} · {selectedPlayer.position}</span><strong>{selectedPlayer.playerName}{selectedPlayer.isCaptain ? " · 주장" : ""}</strong><small>{selectedPlayer.purchasePoints === null ? "경매 대기" : `${selectedPlayer.purchasePoints}P`}</small></article> : null}{destruction.teams.length ? <div className={styles.participantGrid}>{destruction.teams.map((team) => <article className={styles.team} key={team.id}><strong>{team.name}</strong><ul>{team.rosterPlayers.map((player) => <li key={player.participantId}><span>{player.position}</span><Link href={`?tab=participants&player=${encodeURIComponent(player.playerId)}`}>{player.playerName}{player.isCaptain ? " · 주장" : ""}</Link></li>)}</ul></article>)}</div> : <p>참가 선수 명단을 준비하고 있어요.</p>}</section> : null}
    {view.tab === "gallery" ? <section className={styles.tabPanel} aria-labelledby="gallery-title"><h2 id="gallery-title"><Images aria-hidden="true" /> 대회 갤러리</h2>{destruction.gallery ? <><p>{destruction.gallery.title} · {destruction.gallery.description}</p><div className={styles.competitionGallery}>{destruction.gallery.images.map((image) => <Link key={image.assetId} href={`?tab=gallery&imageIndex=${image.ordinal}`} aria-label={`${destruction.gallery!.title} ${image.ordinal + 1}번째 이미지 크게 보기`}><ResilientMediaImage sizes="(max-width: 700px) 100vw, 33vw" src={image.url} alt={`${destruction.gallery!.title} ${image.ordinal + 1}번째 이미지`} /></Link>)}</div></> : <p>운영자가 게시 완료한 대회 전용 갤러리가 아직 없어요.</p>}</section> : null}
    {view.tab === "mvp" ? <section className={styles.tabPanel} aria-labelledby="mvp-results-title"><h2 id="mvp-results-title">경기 MVP 결과</h2>{destruction.mvpResults.length ? <div className={styles.mvpGrid}>{destruction.mvpResults.map((mvp) => <article key={mvp.fixtureId}><Crown aria-hidden="true" /><span>{mvp.fixtureName}</span><strong>{mvp.finalizedPlayerName}</strong><small>{mvp.selectionMethod === "VOTE" ? "참가자 투표 선정" : "운영진 선정"}</small></article>)}</div> : <p>완료된 경기의 10인 투표 결과가 여기에 표시돼요.</p>}</section> : null}
    {selectedImage && destruction.gallery ? <aside className={styles.lightbox} role="dialog" aria-modal="true" aria-labelledby="competition-image-title"><div><Link href="?tab=gallery" aria-label="이미지 닫기"><X aria-hidden="true" /></Link><h2 id="competition-image-title">{destruction.gallery.title} · {selectedImage.ordinal + 1}번째</h2><figure><ResilientMediaImage sizes="100vw" src={selectedImage.url} alt={`${destruction.gallery.title} ${selectedImage.ordinal + 1}번째 이미지 확대`} /></figure></div></aside> : null}
  </div>;
}

type PublicDestruction = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof getRuntimeDestruction>>["repository"]["getPublic"]>>>;

function Overview({ destruction }: { destruction: PublicDestruction }) {
  return <>{destruction.championTeamName ? <section className={styles.championCallout} aria-label="멸망전 최종 결과"><Crown aria-hidden="true" /><div><span>DESTRUCTION CHAMPION</span><h2>{destruction.championTeamName}</h2><p>{destruction.mvpResults.at(-1)?.finalizedPlayerName ? `파이널 MVP ${destruction.mvpResults.at(-1)!.finalizedPlayerName}` : "우승을 축하합니다."}</p></div></section> : null}<section className={styles.detailGrid}><article><div className={styles.sectionHeading}><div><span>TEAM ROSTERS</span><h2>팀과 로스터</h2></div><b>{destruction.teams.filter((team) => team.confirmed).length}/{destruction.teams.length}</b></div>{destruction.teams.length ? <div className={styles.teamGrid}>{destruction.teams.map((team) => <section className={styles.team} key={team.id}><header><strong>{team.name}</strong><span>{team.confirmed ? "로스터 확정" : "편성 중"}</span></header><p>주장 {team.captainPlayerName ?? "선정 전"} · 잔여 {team.remainingAuctionPoints}P</p><ul>{team.rosterPlayers.map((player) => <li key={player.participantId}><span>{player.position}</span><Link href={`?tab=participants&player=${encodeURIComponent(player.playerId)}`}>{player.playerName}{player.isCaptain ? " · 주장" : ""}</Link></li>)}</ul></section>)}</div> : <p>주장과 팀이 아직 확정되지 않았어요.</p>}</article><article><div className={styles.sectionHeading}><div><span>PRELIMINARY</span><h2>예선 결과</h2></div><b>{destruction.preliminaryFixtures.filter((fixture) => fixture.confirmed).length}/{destruction.preliminaryFixtures.length}</b></div>{destruction.preliminaryFixtures.length ? <div className={styles.fixtureList}>{destruction.preliminaryFixtures.map((fixture) => <DestructionFixture fixture={fixture} label={`${fixture.groupKey ?? "예선"} · BO${fixture.bestOf}`} key={fixture.id} />)}</div> : <p>경매 완료 뒤 예선 대진이 공개돼요.</p>}</article><article><div className={styles.sectionHeading}><div><span>TOURNAMENT</span><h2>본선 대진</h2></div><b>{destruction.tournamentFixtures.filter((fixture) => fixture.winnerTeamId).length}/{destruction.tournamentFixtures.length}</b></div>{destruction.tournamentFixtures.length ? <div className={styles.fixtureList}>{destruction.tournamentFixtures.map((fixture) => <DestructionFixture fixture={fixture} label={`${fixture.stage} · BO${fixture.bestOf}`} key={fixture.id} />)}</div> : <p>예선 완료 뒤 상위 팀 대진이 공개돼요.</p>}</article><article><div className={styles.sectionHeading}><div><span>MVP</span><h2>경기 MVP</h2></div><b>{destruction.mvpResults.length}</b></div>{destruction.mvpResults.length ? destruction.mvpResults.map((mvp) => <div className={styles.fixture} key={mvp.fixtureId}><span>{mvp.fixtureName}</span><strong>{mvp.finalizedPlayerName} · {mvp.selectionMethod === "VOTE" ? "투표" : "운영진"}</strong></div>) : <p>완료된 경기의 10인 투표 결과가 여기에 표시돼요.</p>}</article></section></>;
}

function DestructionFixture({ fixture, label }: { fixture: DestructionPublicDto["preliminaryFixtures"][number] | DestructionPublicDto["tournamentFixtures"][number]; label: string }) {
  return <div className={styles.fixture} data-complete={fixture.winnerTeamId !== null}><span>{label}</span><div className={styles.fixtureScore}><strong data-winner={fixture.winnerTeamId !== null && fixture.winnerTeamId === fixture.teamAId}>{fixture.teamAName}</strong><b>{fixture.teamAScore ?? "-"}</b><i>:</i><b>{fixture.teamBScore ?? "-"}</b><strong data-winner={fixture.winnerTeamId !== null && fixture.winnerTeamId === fixture.teamBId}>{fixture.teamBName}</strong></div></div>;
}
