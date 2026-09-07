import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Database, Gamepad2, Pencil, Radio, ShieldCheck, UserRound } from "lucide-react";

import {
  AdminPlayerDeactivate,
  AdminPlayerForm,
  AdminPlayerReactivate,
} from "@/components/admin/players/admin-player-form";
import styles from "@/components/admin/players/admin-players.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { MMR_POSITIONS } from "@/modules/mmr";
import { loadRuntimeMmr } from "@/modules/mmr/infrastructure/runtime-mmr";
import { loadRuntimeAdminPlayer } from "@/modules/players/infrastructure/runtime-admin-player-data";
import { loadRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export default async function AdminPlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { playerId } = await params;
  await requirePageRole("ADMIN", `/admin/players/${playerId}`);
  const query = await searchParams;
  const requestedTab = typeof query.tab === "string" ? query.tab : "profile";
  const tab = requestedTab === "balance" || requestedTab === "riot" ? requestedTab : "profile";
  const editMode = query.mode === "edit";
  const result = await loadRuntimeAdminPlayer(playerId);
  if (result.state === "ready" && !result.data) notFound();

  if (result.state !== "ready") {
    return (
      <main className={styles.page}>
        <Link className={styles.ghostLink} href="/admin/players"><ArrowLeft aria-hidden="true" /> 목록으로</Link>
        <section className={styles.state} data-tone={result.state === "error" ? "error" : undefined} role={result.state === "error" ? "alert" : "status"}>
          <Database aria-hidden="true" />
          <h1>{result.state === "error" ? "플레이어 상세를 불러오지 못했습니다." : "플레이어 정보를 확인할 수 없습니다."}</h1>
          <p>가짜 회원 정보로 대체하지 않습니다. 잠시 후 다시 시도해 주세요.</p>
        </section>
      </main>
    );
  }

  const player = result.data!;
  const mmrResult = tab === "balance"
    ? await loadRuntimeMmr((service) => service.getPlayer(player.id))
    : null;
  const riotResult = tab === "riot"
    ? await loadRuntimeRiot((runtime) => runtime.query.getPublicSummary(player.id))
    : null;
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <Link className={styles.ghostLink} href="/admin/players"><ArrowLeft aria-hidden="true" /> 등록부</Link>
      </div>
      <section className={styles.detailHero}>
        <div className={styles.avatar} aria-hidden="true">{player.nickname.slice(0, 1)}</div>
        <div>
          <span className={styles.status} data-state={player.status}>{player.status === "ACTIVE" ? "활성" : "비활성"}</span>
          <h1>{player.nickname}#{player.tagLine}</h1>
          <p>회원명 · {player.memberName} {player.legacyId ? `· V1 #${player.legacyId}` : "· 신규 UUID 등록"}</p>
        </div>
        <div className={styles.revision}><span>낙관적 잠금</span><strong>revision {player.revision}</strong><span>{formatDate(player.updatedAt)}</span></div>
      </section>

      <nav className={styles.tabs} aria-label="플레이어 관리 상세 탭">
        <Link href={`/admin/players/${player.id}`} aria-current={tab === "profile" && !editMode ? "page" : undefined}><UserRound aria-hidden="true" /> 프로필</Link>
        <Link href={`/admin/players/${player.id}?mode=edit`} aria-current={editMode ? "page" : undefined}><Pencil aria-hidden="true" /> 수정</Link>
        <Link href={`/admin/players/${player.id}?tab=balance`} aria-current={tab === "balance" ? "page" : undefined}><Gamepad2 aria-hidden="true" /> 밸런스</Link>
        <Link href={`/admin/players/${player.id}?tab=riot`} aria-current={tab === "riot" ? "page" : undefined}><Radio aria-hidden="true" /> Riot</Link>
      </nav>

      {editMode ? (
        <section className={styles.formCard}>
          <AdminPlayerForm key={player.revision} mode="edit" player={player} />
        </section>
      ) : tab === "balance" ? (
        <section className={styles.integrationCard}>
          <span className={styles.integrationBadge}>S05-B READY MMR</span>
          <h2>밸런스 프로필</h2>
          {mmrResult?.state === "ready" && mmrResult.data ? <>
            <dl className={styles.facts}>
              <div><dt>종합 MMR</dt><dd>{mmrResult.data.overallScore.toFixed(2)}</dd></div>
              <div><dt>신뢰도</dt><dd>{Math.round(mmrResult.data.confidence * 100)}%</dd></div>
              <div><dt>경기 표본</dt><dd>{mmrResult.data.sampleSize}</dd></div>
              {MMR_POSITIONS.map((position) => <div key={position}><dt>{position}</dt><dd>{mmrResult.data!.positions[position].score.toFixed(2)} · {mmrResult.data!.positions[position].sampleSize}회</dd></div>)}
            </dl>
            <p><Link href={`/admin/balance-ai?tab=players&q=${encodeURIComponent(player.nickname)}`}>MMR 작업대에서 보기</Link></p>
          </> : <p>{mmrResult?.state === "error" ? "MMR 프로필을 불러오지 못했습니다." : "계산된 MMR 프로필이 없습니다."}</p>}
        </section>
      ) : tab === "riot" ? (
        <section className={styles.integrationCard}>
          <span className={styles.integrationBadge}>S12 RIOT</span>
          <h2>Riot 계정·전적</h2>
          {riotResult?.state === "unavailable" ? <p>Riot 운영 adapter가 비활성 상태입니다. 운영 feature flag는 기본적으로 꺼져 있습니다.</p>
            : riotResult?.state === "error" ? <p role="alert">Riot 전적을 불러오지 못했습니다.</p>
            : !riotResult?.data ? <p>아직 공개 가능한 동기화 전적이 없습니다. <Link href="/admin/riot?tab=accounts">Riot 운영 화면에서 연결 상태 확인</Link></p>
            : <dl className={styles.facts}><div><dt>Riot ID</dt><dd>{riotResult.data.riotId}</dd></div><div><dt>솔로 랭크</dt><dd>{riotResult.data.soloTier ?? "Unranked"} {riotResult.data.soloRank ?? ""}</dd></div><div><dt>LP</dt><dd>{riotResult.data.leaguePoints ?? 0}</dd></div><div><dt>전적</dt><dd>{riotResult.data.wins ?? 0}승 {riotResult.data.losses ?? 0}패</dd></div></dl>}
        </section>
      ) : (
        <>
          <div className={styles.detailGrid}>
            <section className={styles.summaryCard}>
              <h2>등록 정보</h2>
              <dl className={styles.facts}>
                <div><dt>관리자 전용 회원명</dt><dd>{player.memberName}</dd></div>
                <div><dt>공개 Riot ID</dt><dd>{player.riotId}</dd></div>
                <div><dt>V1 기존 번호</dt><dd>{player.legacyId ?? "없음"}</dd></div>
                <div><dt>공개 UUID</dt><dd>{player.id}</dd></div>
                <div><dt>현재 티어</dt><dd>{player.currentTier ?? "미등록"}</dd></div>
                <div><dt>최고 티어</dt><dd>{player.peakTier ?? "미등록"}</dd></div>
                <div><dt>등록 시각</dt><dd>{formatDate(player.createdAt)}</dd></div>
                <div><dt>상태 변경</dt><dd>{player.deactivatedAt ? formatDate(player.deactivatedAt) : "활성 유지"}</dd></div>
              </dl>
            </section>
            <aside className={styles.accountCard}>
              <h2><ShieldCheck aria-hidden="true" /> 연결 계정</h2>
              {player.account ? (
                <dl className={styles.facts}>
                  <div><dt>로그인 ID</dt><dd>{player.account.loginId}</dd></div>
                  <div><dt>역할</dt><dd>{player.account.role}</dd></div>
                  <div><dt>상태</dt><dd>{player.account.status}</dd></div>
                  <div><dt>계정 UUID</dt><dd>{player.account.id}</dd></div>
                </dl>
              ) : <p>연결된 사이트 계정이 없습니다. 플레이어 기록은 계정과 독립적으로 보존됩니다.</p>}
            </aside>
          </div>
          {player.status === "ACTIVE" ? (
            <AdminPlayerDeactivate key={`${player.id}-${player.revision}`} player={player} />
          ) : (
            <AdminPlayerReactivate key={`${player.id}-${player.revision}`} player={player} />
          )}
        </>
      )}
    </main>
  );
}
