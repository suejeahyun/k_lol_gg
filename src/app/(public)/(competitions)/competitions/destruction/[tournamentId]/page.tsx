import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown, Gavel, Images, Swords, UsersRound, X } from "lucide-react";

import { ResilientMediaImage } from "@/app/(public)/(media)/resilient-media-image";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { isDestructionUuid } from "@/modules/competitions/destruction";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";
import { parseDestructionDetailView } from "@/modules/competitions/public-navigation";

import styles from "../../events.module.css";
import { DestructionOwnerActions } from "./destruction-owner-actions";

export const dynamic = "force-dynamic";

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
    <header className={styles.detailHero}><div><span>DESTRUCTION · {destruction.status}</span><h1>{destruction.title}</h1><p>모집, 주장 선정, 경매, 예선과 4강 본선이 하나의 기록으로 이어집니다.</p></div><Gavel aria-hidden="true" /></header>
    <section className={styles.facts} aria-label="멸망전 요약">
      <article><UsersRound aria-hidden="true" /><div><span>팀·확정 로스터</span><strong>{destruction.teams.length}팀 · {participantCount}명</strong></div></article>
      <article><Swords aria-hidden="true" /><div><span>예선</span><strong>{destruction.preliminaryFormat} · BO{destruction.preliminaryBestOf}</strong></div></article>
      <article><Crown aria-hidden="true" /><div><span>우승 팀</span><strong>{destruction.championTeamName ?? "아직 결정 전"}</strong></div></article>
    </section>
    <nav className={styles.detailTabs} aria-label="멸망전 상세 메뉴">
      <Link aria-current={view.tab === "overview" ? "page" : undefined} href={`/competitions/destruction/${destruction.id}`}>대회 현황</Link>
      <Link aria-current={view.tab === "captain-points" ? "page" : undefined} href={`?tab=captain-points`}>주장 포인트</Link>
      <Link aria-current={view.tab === "participants" ? "page" : undefined} href={`?tab=participants`}>참가 선수</Link>
      <Link aria-current={view.tab === "gallery" ? "page" : undefined} href={`?tab=gallery`}>갤러리</Link>
      <Link aria-current={view.tab === "mvp" ? "page" : undefined} href={`?tab=mvp`}>MVP</Link>
    </nav>
    <DestructionOwnerActions tournamentId={destruction.id} revision={destruction.revision} status={destruction.status} signedIn={Boolean(session)} approved={session?.accountStatus === "APPROVED"} application={own} mvpBallots={ownMvpBallots} focusTarget={view.action === "apply" ? "apply" : view.tab === "mvp" ? "mvp" : null} />
    {view.tab === "overview" ? <Overview destruction={destruction} /> : null}
    {view.tab === "captain-points" ? <section className={styles.tabPanel} aria-labelledby="captain-points-title"><h2 id="captain-points-title">주장별 경매 포인트</h2>{destruction.teams.length ? <div className={styles.pointGrid}>{destruction.teams.map((team) => <article key={team.id}><strong>{team.name}</strong><span>주장 {team.captainPlayerName ?? "선정 전"}</span><b>{team.remainingAuctionPoints}P</b><small>시작 {team.initialAuctionPoints}P · 사용 {team.initialAuctionPoints - team.remainingAuctionPoints}P</small></article>)}</div> : <p>주장 선정 뒤 포인트가 공개돼요.</p>}</section> : null}
    {view.tab === "participants" ? <section className={styles.tabPanel} aria-labelledby="participants-title"><h2 id="participants-title">참가 선수</h2>{selectedPlayer ? <article className={styles.selectedPlayer} tabIndex={-1} autoFocus role="region" aria-label={`${selectedPlayer.playerName} 선수 상세`}><span>{selectedPlayer.teamName} · {selectedPlayer.position}</span><strong>{selectedPlayer.playerName}{selectedPlayer.isCaptain ? " · 주장" : ""}</strong><small>{selectedPlayer.purchasePoints === null ? "경매 대기" : `${selectedPlayer.purchasePoints}P`}</small></article> : null}{destruction.teams.length ? <div className={styles.participantGrid}>{destruction.teams.map((team) => <article className={styles.team} key={team.id}><strong>{team.name}</strong><ul>{team.rosterPlayers.map((player) => <li key={player.participantId}><span>{player.position}</span><Link href={`?tab=participants&player=${encodeURIComponent(player.playerId)}`}>{player.playerName}{player.isCaptain ? " · 주장" : ""}</Link></li>)}</ul></article>)}</div> : <p>참가 선수 명단을 준비하고 있어요.</p>}</section> : null}
    {view.tab === "gallery" ? <section className={styles.tabPanel} aria-labelledby="gallery-title"><h2 id="gallery-title"><Images aria-hidden="true" /> 대회 갤러리</h2>{destruction.gallery ? <><p>{destruction.gallery.title} · {destruction.gallery.description}</p><div className={styles.competitionGallery}>{destruction.gallery.images.map((image) => <Link key={image.assetId} href={`?tab=gallery&imageIndex=${image.ordinal}`} aria-label={`${destruction.gallery!.title} ${image.ordinal + 1}번째 이미지 크게 보기`}><ResilientMediaImage sizes="(max-width: 700px) 100vw, 33vw" src={image.url} alt={`${destruction.gallery!.title} ${image.ordinal + 1}번째 이미지`} /></Link>)}</div></> : <p>운영자가 게시 완료한 대회 전용 갤러리가 아직 없어요.</p>}</section> : null}
    {view.tab === "mvp" ? <section className={styles.tabPanel} aria-labelledby="mvp-results-title"><h2 id="mvp-results-title">경기 MVP 결과</h2>{destruction.mvpResults.length ? destruction.mvpResults.map((mvp) => <div className={styles.fixture} key={mvp.fixtureId}><span>{mvp.fixtureName}</span><strong>{mvp.finalizedPlayerName} · {mvp.selectionMethod}</strong></div>) : <p>완료된 경기의 10인 투표 결과가 여기에 표시돼요.</p>}</section> : null}
    {selectedImage && destruction.gallery ? <aside className={styles.lightbox} role="dialog" aria-modal="true" aria-labelledby="competition-image-title"><div><Link href="?tab=gallery" aria-label="이미지 닫기"><X aria-hidden="true" /></Link><h2 id="competition-image-title">{destruction.gallery.title} · {selectedImage.ordinal + 1}번째</h2><figure><ResilientMediaImage sizes="100vw" src={selectedImage.url} alt={`${destruction.gallery.title} ${selectedImage.ordinal + 1}번째 이미지 확대`} /></figure></div></aside> : null}
  </div>;
}

type PublicDestruction = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof getRuntimeDestruction>>["repository"]["getPublic"]>>>;

function Overview({ destruction }: { destruction: PublicDestruction }) {
  return <section className={styles.detailGrid}><article><h2>팀과 로스터</h2>{destruction.teams.length ? destruction.teams.map((team) => <div className={styles.team} key={team.id}><strong>{team.name}{team.confirmed ? " · 확정" : ""}</strong><ul>{team.rosterPlayers.map((player) => <li key={player.participantId}><span>{player.position}</span>{player.playerName}</li>)}</ul></div>) : <p>주장과 팀이 아직 확정되지 않았어요.</p>}</article><article><h2>예선 결과</h2>{destruction.preliminaryFixtures.length ? destruction.preliminaryFixtures.map((fixture) => <div className={styles.fixture} key={fixture.id}><span>{fixture.groupKey ?? "예선"} · BO{fixture.bestOf}</span><strong>{fixture.teamAName} {fixture.teamAScore ?? "-"} : {fixture.teamBScore ?? "-"} {fixture.teamBName}</strong></div>) : <p>경매 완료 뒤 예선 대진이 공개돼요.</p>}</article><article><h2>본선 대진</h2>{destruction.tournamentFixtures.length ? destruction.tournamentFixtures.map((fixture) => <div className={styles.fixture} key={fixture.id}><span>{fixture.stage} · BO{fixture.bestOf}</span><strong>{fixture.teamAName} {fixture.teamAScore ?? "-"} : {fixture.teamBScore ?? "-"} {fixture.teamBName}</strong></div>) : <p>예선 완료 뒤 상위 4팀 대진이 공개돼요.</p>}</article><article><h2>경기 MVP</h2>{destruction.mvpResults.length ? destruction.mvpResults.map((mvp) => <div className={styles.fixture} key={mvp.fixtureId}><span>{mvp.fixtureName}</span><strong>{mvp.finalizedPlayerName} · {mvp.selectionMethod}</strong></div>) : <p>완료된 경기의 10인 투표 결과가 여기에 표시돼요.</p>}</article></section>;
}
