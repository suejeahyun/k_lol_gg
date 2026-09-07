import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown, Gavel, Swords, UsersRound } from "lucide-react";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { isDestructionUuid } from "@/modules/competitions/destruction";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";

import styles from "../../events.module.css";
import { DestructionOwnerActions } from "./destruction-owner-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ tournamentId: string }> }): Promise<Metadata> {
  const { tournamentId } = await params;
  return { title: "멸망전 상세", alternates: { canonical: `/competitions/destruction/${encodeURIComponent(tournamentId)}` } };
}

export default async function DestructionDetailPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId: rawId } = await params;
  if (!isDestructionUuid(rawId)) notFound();
  const tournamentId = rawId.toLocaleLowerCase("en-US");
  const runtime = getRuntimeDestruction();
  if (!runtime) return <main className={styles.page}><section className={styles.state} role="status"><h1>멸망전 저장소를 준비하고 있어요.</h1><p>영속 저장소 연결 뒤 같은 주소에서 바로 이용할 수 있습니다.</p></section></main>;
  let destruction;
  try { destruction = await runtime.repository.getPublic(tournamentId); }
  catch { return <main className={styles.page}><section className={styles.state} role="alert"><h1>멸망전을 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p></section></main>; }
  if (!destruction) notFound();
  const session = await getCurrentSession("ACCOUNT");
  const own = session ? await runtime.repository.getOwnApplication(tournamentId, session.userId).catch(() => null) : null;
  const participantCount = destruction.teams.reduce((count, team) => count + team.rosterPlayerIds.length, 0);

  return <main className={styles.page}>
    <Link className={styles.back} href="/competitions"><ArrowLeft aria-hidden="true" /> 대회 목록</Link>
    <header className={styles.detailHero}><div><span>DESTRUCTION · {destruction.status}</span><h1>{destruction.title}</h1><p>모집, 주장 선정, 경매, 예선과 4강 본선이 하나의 기록으로 이어집니다.</p></div><Gavel aria-hidden="true" /></header>
    <section className={styles.facts} aria-label="멸망전 요약">
      <article><UsersRound aria-hidden="true" /><div><span>팀·확정 로스터</span><strong>{destruction.teams.length}팀 · {participantCount}명</strong></div></article>
      <article><Swords aria-hidden="true" /><div><span>예선</span><strong>{destruction.preliminaryFormat} · BO{destruction.preliminaryBestOf}</strong></div></article>
      <article><Crown aria-hidden="true" /><div><span>우승 팀</span><strong>{destruction.championTeamId ?? "아직 결정 전"}</strong></div></article>
    </section>
    <DestructionOwnerActions tournamentId={destruction.id} revision={destruction.revision} status={destruction.status} signedIn={Boolean(session)} approved={session?.accountStatus === "APPROVED"} application={own} />
    <section className={styles.detailGrid}>
      <article><h2>팀과 로스터</h2>{destruction.teams.length ? destruction.teams.map((team) => <div className={styles.team} key={team.id}><strong>{team.name}{team.confirmed ? " · 확정" : ""}</strong><ul>{team.rosterPlayerIds.map((playerId) => <li key={playerId}>{playerId}</li>)}</ul></div>) : <p>주장과 팀이 아직 확정되지 않았어요.</p>}</article>
      <article><h2>예선 결과</h2>{destruction.preliminaryFixtures.length ? destruction.preliminaryFixtures.map((fixture) => <div className={styles.fixture} key={fixture.id}><span>{fixture.groupKey ?? "예선"} · BO{fixture.bestOf}</span><strong>{fixture.teamAId} {fixture.teamAScore ?? "-"} : {fixture.teamBScore ?? "-"} {fixture.teamBId}</strong></div>) : <p>경매 완료 뒤 예선 대진이 공개돼요.</p>}</article>
      <article><h2>본선 대진</h2>{destruction.tournamentFixtures.length ? destruction.tournamentFixtures.map((fixture) => <div className={styles.fixture} key={fixture.id}><span>{fixture.stage} · BO{fixture.bestOf}</span><strong>{fixture.teamAId ?? "미정"} {fixture.teamAScore ?? "-"} : {fixture.teamBScore ?? "-"} {fixture.teamBId ?? "미정"}</strong></div>) : <p>예선 완료 뒤 상위 4팀 대진이 공개돼요.</p>}</article>
      <article><h2>경기 MVP</h2>{destruction.mvpResults.length ? destruction.mvpResults.map((mvp) => <div className={styles.fixture} key={mvp.fixtureId}><span>{mvp.fixtureId}</span><strong>{mvp.finalizedPlayerId} · {mvp.selectionMethod}</strong></div>) : <p>완료된 경기의 10인 투표 결과가 여기에 표시돼요.</p>}</article>
    </section>
  </main>;
}
