import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모바일 내정보",
  robots: { index: false, follow: false },
};

function isAdminRole(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function formatWinRate(wins?: number | null, totalGames?: number | null) {
  const total = totalGames ?? 0;
  if (total <= 0) return "0%";
  const value = Math.round(((wins ?? 0) / total) * 1000) / 10;
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function formatKda(kills?: number | null, deaths?: number | null, assists?: number | null) {
  const d = deaths ?? 0;
  if (d <= 0) return "Perfect";
  return (((kills ?? 0) + (assists ?? 0)) / d).toFixed(2);
}

function tierLabel(tier?: string | null, rank?: string | null, lp?: number | null) {
  if (!tier) return "연동 대기";
  return `${tier}${rank ? ` ${rank}` : ""} · ${lp ?? 0}LP`;
}

export default async function AppMePage() {
  const session = await getCurrentUser().catch(() => null);
  const user = session
    ? await prisma.userAccount.findUnique({
        where: { id: session.userAccountId },
        include: {
          player: {
            include: {
              riotAccount: true,
              soloRankSnapshot: true,
            },
          },
        },
      })
    : null;

  const player = user?.player ?? null;
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });

  const [myStat, myKda] = await Promise.all([
    player && season
      ? prisma.playerSeasonStat.findUnique({
          where: { playerId_seasonId: { playerId: player.id, seasonId: season.id } },
        })
      : Promise.resolve(null),
    player && season
      ? prisma.matchParticipant.aggregate({
          where: {
            playerId: player.id,
            game: { series: { seasonId: season.id } },
          },
          _sum: { kills: true, deaths: true, assists: true },
        })
      : Promise.resolve(null),
  ]);

  const isAdmin = isAdminRole(user?.role ?? session?.role);

  return (
    <AppMobileShell subtitle="내 정보">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">MY PAGE</div>
        <h1 className="klol-app-title">{player ? player.name || player.nickname : "내정보"}</h1>
        <div className="klol-app-actions klol-app-actions--keep">
          {!user ? (
            <Link className="klol-app-primary" href="/app/login?next=/app/me">로그인</Link>
          ) : (
            <Link className="klol-app-primary" href="/app/account">계정 관리</Link>
          )}
          {isAdmin ? <Link className="klol-app-secondary" href="/app/admin">관리자</Link> : null}
        </div>
      </section>

      {!user ? (
        <AppSection title="로그인 필요">
          <AppEmpty>로그인 후 내 시즌 기록과 계정 상태를 확인할 수 있습니다.</AppEmpty>
        </AppSection>
      ) : (
        <>
          <AppSection title="계정">
            <div className="klol-app-meta-grid">
              <div className="klol-app-meta">
                <span>아이디</span>
                <strong>{user.userId}</strong>
              </div>
              <div className="klol-app-meta">
                <span>권한</span>
                <strong>{isAdmin ? "관리자" : "일반"}</strong>
              </div>
              <div className="klol-app-meta">
                <span>상태</span>
                <strong>{user.status}</strong>
              </div>
            </div>
          </AppSection>

          <AppSection title="플레이어">
            <div className="klol-app-meta-grid klol-app-meta-grid--player-detail">
              <div className="klol-app-meta">
                <span>닉네임#태그</span>
                <strong>{player ? `${player.nickname}#${player.tag}` : "-"}</strong>
              </div>
              <div className="klol-app-meta">
                <span>내전 티어</span>
                <strong>{player?.currentTier || "-"}</strong>
              </div>
              <div className="klol-app-meta">
                <span>Riot 솔랭</span>
                <strong>{tierLabel(player?.soloRankSnapshot?.tier, player?.soloRankSnapshot?.rank, player?.soloRankSnapshot?.leaguePoints)}</strong>
              </div>
              <div className="klol-app-meta">
                <span>Riot 연동</span>
                <strong>{player?.riotAccount?.isVerified ? "검증됨" : player?.riotAccount ? "등록됨" : "미연동"}</strong>
              </div>
            </div>
          </AppSection>

          <AppSection title="내 시즌 요약" caption={season?.name}>
            <div className="klol-app-meta-grid">
              <div className="klol-app-meta">
                <span>참여</span>
                <strong>{myStat?.participationCount ?? 0}회</strong>
              </div>
              <div className="klol-app-meta">
                <span>승률</span>
                <strong>{formatWinRate(myStat?.wins, myStat?.totalGames)}</strong>
              </div>
              <div className="klol-app-meta">
                <span>KDA</span>
                <strong>{formatKda(myKda?._sum.kills, myKda?._sum.deaths, myKda?._sum.assists)}</strong>
              </div>
              <div className="klol-app-meta">
                <span>MVP</span>
                <strong>{myStat?.mvpCount ?? 0}회</strong>
              </div>
            </div>
          </AppSection>

          <AppSection title="바로가기">
            <div className="klol-app-list">
              {player ? (
                <Link className="klol-app-list-card" href={`/app/players/${player.id}`}>
                  <span className="klol-app-list-title">
                    <strong>내 플레이어 상세</strong>
                    <span>내전 분석과 솔랭 요약</span>
                  </span>
                </Link>
              ) : null}
              <Link className="klol-app-list-card" href="/app/account">
                <span className="klol-app-list-title">
                  <strong>계정 관리</strong>
                  <span>비밀번호와 로그인 정보</span>
                </span>
              </Link>
              <Link className="klol-app-list-card" href="/install">
                <span className="klol-app-list-title">
                  <strong>앱 설치</strong>
                  <span>Android APK 다운로드와 iPhone 홈 화면 추가</span>
                </span>
              </Link>
            </div>
          </AppSection>
        </>
      )}
    </AppMobileShell>
  );
}
