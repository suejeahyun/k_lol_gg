import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Database,
  Images,
  LogIn,
  Search,
  ShieldCheck,
  Swords,
  Trophy,
  UsersRound,
} from "@/components/theme/theme-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HomeRankingCarousel } from "@/components/home/home-ranking-carousel";
import { HomeGuideArt } from "@/components/home/home-guide-art";
import { MediaCarousel } from "@/app/(public)/(media)/media-carousel";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { homeChampionPresentation } from "@/modules/home/domain/home-snapshot";
import {
  loadRuntimeDailyHomeChampion,
  loadRuntimeHomeSnapshot,
} from "@/modules/home/infrastructure/runtime-home-data";
import { loadRuntimeStatisticsData } from "@/modules/statistics/infrastructure/runtime-statistics-data";
import { buildHomePublicRankingSummaries } from "@/modules/statistics/domain/public-ranking-view";

import effects from "./home-effects.module.css";

export const dynamic = "force-dynamic";

export const metadata = createRouteMetadata("/");

const taskCards = [
  { title: "오늘 내전 참가", href: "/applications", icon: CalendarDays, tone: "sky", status: null },
  { title: "파티 찾기", href: "/recruits", icon: UsersRound, tone: "peach", status: null },
  { title: "실력 맞춰 팀 나누기", href: "/tools/team-balance", icon: ShieldCheck, tone: "mint", status: "로그인 필요" },
  { title: "경기 결과 제출", href: "/matches/submit", icon: Swords, tone: "lilac", status: "로그인 필요" },
] as const;

const accountStatusLabel = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "승인 거절",
  SUSPENDED: "이용 제한",
} as const;

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function FeedEmpty({ children }: { children: React.ReactNode }) {
  return <p className="home-feed-empty">{children}</p>;
}

function HomeDataState({ result }: { result: Awaited<ReturnType<typeof loadRuntimeHomeSnapshot>> }) {
  if (result.state === "ready") {
    return (
      <div className="home-data-state home-data-state--ready" role="status">
        <span><Database size={18} aria-hidden="true" /> 공개 기록</span>
        <strong>활성 플레이어 {result.snapshot.activePlayerCount.toLocaleString("ko-KR")}명 · 확정 경기 {result.snapshot.publishedMatchCount.toLocaleString("ko-KR")}건</strong>
        <p>진행 중인 시즌 {result.snapshot.activeSeasonCount.toLocaleString("ko-KR")}개</p>
      </div>
    );
  }

  if (result.state === "error") {
    return (
      <div className="home-data-state home-data-state--error" role="alert">
        <Database size={18} aria-hidden="true" />
        <strong>공개 현황을 불러오지 못했어요.</strong>
      </div>
    );
  }

  return (
    <div className="home-data-state" role="status">
      <Database size={18} aria-hidden="true" />
      <strong>지금은 공개 현황을 표시할 수 없어요.</strong>
    </div>
  );
}

export default async function HomePage() {
  const [homeResult, session, dailyChampionResult, rankingResult] = await Promise.all([
    loadRuntimeHomeSnapshot(),
    getCurrentSession("ACCOUNT"),
    loadRuntimeDailyHomeChampion(),
    loadRuntimeStatisticsData((service) => service.getPublicSeasonRanking(null, 10)),
  ]);
  const accountRepository = session ? getRuntimeAccountRepository() : null;
  const account = session && accountRepository
    ? await accountRepository.findSelf(session.userId).catch(() => null)
    : null;
  const dailyChampion = dailyChampionResult.state === "ready"
    ? dailyChampionResult.data.champion
    : null;
  const displayChampion = dailyChampion ?? {
    key: "ahri",
    displayName: "아리",
    imageUrl: null,
  };
  const championPresentation = homeChampionPresentation(displayChampion);
  const currentRankings = rankingResult.state === "ready"
    ? buildHomePublicRankingSummaries(rankingResult.data.rankings)
    : [];
  const destructionWinnerSlides = homeResult.state === "ready"
    ? homeResult.snapshot.feeds.destructionWinnerGalleries.flatMap((gallery) => {
      const displayTitle = gallery.tournamentTitle ?? gallery.galleryTitle;
      return gallery.images.map((image, index) => ({
        id: `${gallery.galleryId}:${image.id}`,
        src: image.url,
        alt: `${displayTitle} 우승 사진 ${index + 1}`,
        href: `/images/${gallery.galleryId}`,
        eyebrow: "멸망전 우승",
        title: displayTitle,
        description: gallery.galleryDescription === displayTitle ? "" : gallery.galleryDescription,
      }));
    })
    : [];

  return (
    <div className={`page-wrap home-page ${effects.effectsRoot}`}>
      <section className="hero-panel" aria-labelledby="home-title">
        <div className="hero-copy">
          <h1 id="home-title">
            우리 같이
            <span>롤하자~</span>
          </h1>

          <div className="home-join-actions">
            <Link href="/applications"><CalendarDays size={22} aria-hidden="true" /> 오늘 내전 참가</Link>
            <Link href="/recruits"><UsersRound size={22} aria-hidden="true" /> 파티 찾기</Link>
          </div>
          <form className="hero-search" action="/players" method="get">
            <label className="sr-only" htmlFor="home-player-search">
              플레이어 전적 검색: 회원명, 닉네임 또는 Riot ID
            </label>
            <Search aria-hidden="true" size={19} />
            <Input
              id="home-player-search"
              name="q"
              maxLength={80}
              placeholder="플레이어 닉네임 · Riot ID"
              autoComplete="off"
            />
            <Button size="lg" type="submit">전적 검색</Button>
          </form>

          <Link className="home-start-link" href="/start">이용 안내 <ArrowRight className="theme-inline-icon" aria-hidden="true" /></Link>
        </div>

        <div
          className="hero-art"
          data-tone={championPresentation.tone}
          data-guide-audience="female-only"
          data-guide-art="female-champion-original-v2"
          data-champion-key={displayChampion.key}
          data-champion-name={displayChampion.displayName}
        >
          <HomeGuideArt
            webpSrc={championPresentation.localImageSrc}
            alt={championPresentation.localImageAlt ?? `${displayChampion.displayName} 비공식 팬아트`}
          />
          <div className="hero-art__wash" aria-hidden="true" />
          <div className="hero-art__label">
            <span>오늘의 안내 챔피언</span>
            <strong>{displayChampion.displayName}</strong>
          </div>
        </div>
      </section>

      <section className="home-ranking-section" aria-labelledby="home-ranking-title">
        <div className="section-heading">
          <div>
            <h2 id="home-ranking-title">랭킹</h2>
          </div>
          <Link href="/rankings">전체 랭킹 보기 <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        {currentRankings.some((ranking) => ranking.rows.length) ? (
          <HomeRankingCarousel
            seasonName={rankingResult.state === "ready" ? rankingResult.data.season?.name ?? "시즌 랭킹" : "시즌 랭킹"}
            minimumParticipation={rankingResult.state === "ready" ? rankingResult.data.minimumParticipation : 10}
            slides={currentRankings.map((ranking) => ({
              id: ranking.id,
              label: ranking.label,
              metricLabel: ranking.metricLabel,
              rows: ranking.rows.map((row) => ({
                playerId: row.playerId,
                displayName: row.displayName,
                riotId: row.riotId,
                value: ranking.metric(row),
              })),
            }))}
          />
        ) : (
          <div className={`home-ranking-empty${rankingResult.state === "error" ? " home-ranking-empty--error" : ""}`} role={rankingResult.state === "error" ? "alert" : "status"}>
            <Trophy size={24} aria-hidden="true" />
            <div><strong>{rankingResult.state === "ready" ? "아직 순위가 없어요." : rankingResult.state === "unavailable" ? "랭킹 집계를 준비하고 있어요." : "랭킹을 불러오지 못했어요."}</strong>{rankingResult.state === "ready" ? <p>집계 기준: 시즌 10회 이상 참여</p> : null}</div>
          </div>
        )}
      </section>

      <section className="task-section" aria-labelledby="tasks-title">
        <div className="section-heading">
          <div>
            <h2 id="tasks-title">무엇을 하러 왔나요?</h2>
          </div>
        </div>
        <div className="task-grid" data-usage-context="home">
          {taskCards.map(({ title, href, icon: Icon, tone, status }) => {
            const content = (
              <>
                <span className="task-link__icon"><Icon size={22} aria-hidden="true" /></span>
                <span className="task-link__copy">
                  {status ? <small>{session ? "승인 계정 필요" : status}</small> : null}
                  <strong>{title}</strong>
                </span>
                {href ? <ArrowRight className="task-link__arrow" size={18} aria-hidden="true" /> : null}
              </>
            );

            return href ? (
              <Link className={`task-link task-link--${tone}`} href={href} key={title}>{content}</Link>
            ) : (
              <article className={`task-link task-link--${tone} task-link--planned`} key={title}>{content}</article>
            );
          })}
        </div>
      </section>

      <section className="home-overview-section" aria-labelledby="home-overview-title">
        <div className="section-heading">
          <div>
            <h2 id="home-overview-title">지금 올라온 소식</h2>
          </div>
        </div>
        {homeResult.state === "ready" ? (
          <div className="home-overview-grid">
            <article className="home-feed-panel" data-feed-kind="matches">
              <header><Swords aria-hidden="true" /><div><span>최근 경기</span><strong>{homeResult.snapshot.feeds.recentMatches.length}건</strong></div><Link href="/matches">전체 보기</Link></header>
              {homeResult.snapshot.feeds.recentMatches.length ? <ul>{homeResult.snapshot.feeds.recentMatches.map((match) => <li key={match.id}><Link href={`/matches/${match.id}`}><span><strong>{match.title}</strong><small>경기일 {dateLabel(match.playedOn)} · BLUE {match.blueWins}:{match.redWins} RED</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <FeedEmpty>아직 공개 확정 경기가 없어요.</FeedEmpty>}
            </article>
            <article className="home-feed-panel" data-feed-kind="recruits">
              <header><UsersRound aria-hidden="true" /><div><span>참가 가능한 파티</span><strong>{homeResult.snapshot.feeds.recruits.length}건</strong></div><Link href="/recruits">전체 보기</Link></header>
              {homeResult.snapshot.feeds.recruits.length ? <ul>{homeResult.snapshot.feeds.recruits.map((recruit) => <li key={`${recruit.kind}-${recruit.id}`}><Link href={`/recruits#${recruit.kind.toLowerCase()}-${recruit.id}`}><span><strong>{recruit.title}</strong><small>{recruit.kind === "PARTY" ? "파티" : "스크림"} · {recruit.summary}</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <FeedEmpty>현재 빈자리가 있는 파티가 없어요.</FeedEmpty>}
            </article>
            <article className="home-feed-panel" data-feed-kind="competitions">
              <header><Trophy aria-hidden="true" /><div><span>대회 현황</span><strong>{homeResult.snapshot.feeds.competitions.length}건</strong></div><Link href="/competitions">전체 보기</Link></header>
              {homeResult.snapshot.feeds.competitions.length ? <ul>{homeResult.snapshot.feeds.competitions.map((competition) => <li key={`${competition.kind}-${competition.id}`}><Link href={competition.kind === "EVENT" ? `/competitions/events/${competition.id}` : `/competitions/destruction/${competition.id}`}><span><strong>{competition.title}</strong><small>{competition.kind === "EVENT" ? "이벤트전" : "멸망전"} · {({ DRAFT: "준비 중", RECRUITING: "모집 중", TEAM_BUILDING: "팀 구성 중", PLANNED: "준비 중", AUCTION: "경매 중", PRELIMINARY: "예선 진행 중", TOURNAMENT: "본선 진행 중", IN_PROGRESS: "진행 중", COMPLETED: "종료", CANCELLED: "취소" } as Record<string, string>)[competition.status] ?? "진행 현황"} · {competition.participantCount}명</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <FeedEmpty>공개된 이벤트전·멸망전이 아직 없어요.</FeedEmpty>}
            </article>
            <article className="home-feed-panel" data-feed-kind="champions">
              <header><Images aria-hidden="true" /><div><span>멸망전 우승 사진</span><strong>{destructionWinnerSlides.length}장</strong></div><Link href="/images">전체 보기</Link></header>
              {destructionWinnerSlides.length ? <MediaCarousel label="멸망전 우승 사진" slides={destructionWinnerSlides} sizes="(max-width: 820px) 100vw, 50vw" variant="compact" /> : <FeedEmpty>게시 완료된 멸망전 우승 사진이 아직 없어요.</FeedEmpty>}
            </article>
          </div>
        ) : (
          <div className={`home-data-state${homeResult.state === "error" ? " home-data-state--error" : ""}`} role={homeResult.state === "error" ? "alert" : "status"}>
            <Database aria-hidden="true" /><strong>지금은 최근 소식을 불러올 수 없어요.</strong>
          </div>
        )}
      </section>

      <section className="home-personal-section" aria-labelledby="home-personal-title">
        <div className="home-personal-copy">
          <h2 id="home-personal-title">내 활동 이어보기</h2>
          {account ? <><p><strong>{account.loginId}</strong> · {accountStatusLabel[account.status]}</p><div className="home-personal-actions"><Link href="/account">내 계정</Link>{account.player ? <Link href={`/players/${account.player.id}`}>{account.player.riotId} 프로필</Link> : <Link href="/account?tab=player">플레이어 연결 확인</Link>}<Link href="/applications">내 참가 신청</Link><Link href="/matches/submissions">내 제출 기록</Link><Link href="/tools/team-balance/drafts">저장한 팀</Link></div></> : session ? <><p role="alert">계정 정보를 불러오지 못했어요.</p><div className="home-personal-actions"><Link href="/account">계정에서 다시 확인</Link></div></> : <div className="home-personal-actions"><Link href="/login"><LogIn aria-hidden="true" /> 로그인</Link><Link href="/signup">가입하기</Link></div>}
        </div>
        <div className="home-season-card" data-season-state={homeResult.state === "ready" && homeResult.snapshot.activeSeason ? "active" : "inactive"}>
          <CalendarDays aria-hidden="true" />
          <span>현재 시즌</span>
          {homeResult.state === "ready" && homeResult.snapshot.activeSeason ? <><strong>{homeResult.snapshot.activeSeason.name}</strong><small>{homeResult.snapshot.activeSeason.endsAt ? `${dateLabel(homeResult.snapshot.activeSeason.endsAt)} 종료 예정` : "종료 일정 미정"}</small><Link href="/applications">참가 현황 보기 <ArrowRight aria-hidden="true" /></Link></> : <strong>{homeResult.state === "ready" ? "활성 시즌 없음" : "확인할 수 없음"}</strong>}
        </div>
      </section>

      <section className="home-status-section" aria-labelledby="home-status-title">
        <div className="section-heading">
          <div>
            <h2 id="home-status-title">지금 볼 수 있는 기록</h2>
          </div>
        </div>
        <HomeDataState result={homeResult} />
        <div className="home-record-links"><Link href="/players">플레이어 전적 찾기 <ArrowRight size={16} aria-hidden="true" /></Link><Link href="/matches">지난 경기 둘러보기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
      </section>
    </div>
  );
}
