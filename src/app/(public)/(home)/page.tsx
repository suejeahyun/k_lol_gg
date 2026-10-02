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
  Sparkles,
  Swords,
  Trophy,
  UsersRound,
} from "@/components/theme/theme-icons";

import { Badge } from "@/components/ui/badge";
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
  { title: "오늘 내전 참가", description: "현재 인원과 내 신청 상태를 확인하고 참가하세요.", href: "/applications", icon: CalendarDays, tone: "sky", status: "모집 현황 보기" },
  { title: "파티 찾기", description: "같이할 사람과 남은 자리를 확인하세요.", href: "/recruits", icon: UsersRound, tone: "peach", status: "참가 방법 안내" },
  { title: "팀 나누기", description: "실력과 포지션에 맞춰 10명을 나누세요.", href: "/tools/team-balance", icon: ShieldCheck, tone: "mint", status: "로그인 필요" },
  { title: "경기 결과 올리기", description: "결과를 제출하고 검토 상태를 확인하세요.", href: "/matches/submit", icon: Swords, tone: "lilac", status: "로그인 필요" },
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
        <span><Database size={18} aria-hidden="true" /> 지금 함께하고 있어요</span>
        <strong>{result.snapshot.activePlayerCount.toLocaleString("ko-KR")}명 · {result.snapshot.publishedMatchCount.toLocaleString("ko-KR")}경기</strong>
        <p>활성 플레이어와 확정된 경기 수입니다. 현재 진행 중인 시즌은 {result.snapshot.activeSeasonCount.toLocaleString("ko-KR")}개예요.</p>
      </div>
    );
  }

  if (result.state === "error") {
    return (
      <div className="home-data-state home-data-state--error" role="alert">
        <span><Database size={18} aria-hidden="true" /> 일시적인 조회 오류</span>
        <strong>공개 현황을 불러오지 못했어요.</strong>
        <p>플레이어 검색은 계속 이용할 수 있어요. 잠시 후 다시 확인해 주세요.</p>
      </div>
    );
  }

  return (
    <div className="home-data-state" role="status">
      <span><Database size={18} aria-hidden="true" /> 현황 확인 필요</span>
      <strong>지금은 공개 현황을 표시할 수 없어요.</strong>
      <p>잠시 후 다시 확인해 주세요. 검색과 이용 안내는 계속 열어볼 수 있습니다.</p>
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
        description: gallery.galleryDescription,
      }));
    })
    : [];

  return (
    <div className={`page-wrap home-page ${effects.effectsRoot}`}>
      <section className="hero-panel" aria-labelledby="home-title">
        <div className="hero-copy">
          <Badge className="foundation-badge" variant="secondary">
            <Sparkles size={13} aria-hidden="true" />
            K-LOL.GG · 함께하는 내전
          </Badge>
          <h1 id="home-title">
            우리 같이
            <span>롤하자~</span>
          </h1>
          <p className="hero-description">
            같이할 사람을 찾고, 팀을 나누고, 오늘의 기록을 남겨요.
          </p>

          <form className="hero-search" action="/players" method="get">
            <label className="sr-only" htmlFor="home-player-search">
              회원명, 플레이어 닉네임 또는 Riot ID
            </label>
            <Search aria-hidden="true" size={19} />
            <Input
              id="home-player-search"
              name="q"
              maxLength={80}
              placeholder="닉네임 또는 Riot ID"
              autoComplete="off"
            />
            <Button size="lg" type="submit">전적 검색</Button>
          </form>

          <Link className="home-start-link" href="/start">처음이신가요? 이용 방법 보기 <ArrowRight className="theme-inline-icon" aria-hidden="true" /></Link>
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
            <small>{championPresentation.message}</small>
            <em>{dailyChampion ? "KST 기준 매일 변경" : "여성 챔피언 팬아트"}</em>
          </div>
        </div>
      </section>

      <section className="home-ranking-section" aria-labelledby="home-ranking-title">
        <div className="section-heading">
          <div>
            <p>SEASON RANKING</p>
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
              description: ranking.description,
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
            <div><strong>{rankingResult.state === "ready" ? "아직 순위가 없어요." : rankingResult.state === "unavailable" ? "랭킹 집계를 준비하고 있어요." : "랭킹을 불러오지 못했어요."}</strong><p>{rankingResult.state === "ready" ? "시즌에 10회 이상 참여한 플레이어의 기록이 집계되면 보여 드릴게요." : rankingResult.state === "unavailable" ? "집계 환경이 준비되면 승률·참여·MVP 순위를 표시합니다." : "전체 랭킹 페이지에서 잠시 후 다시 확인해 주세요."}</p></div>
          </div>
        )}
      </section>

      <section className="task-section" aria-labelledby="tasks-title">
        <div className="section-heading">
          <div>
            <p>QUICK START</p>
            <h2 id="tasks-title">무엇을 하러 왔나요?</h2>
          </div>
          <span>자주 쓰는 기능을 한 번에 시작할 수 있어요.</span>
        </div>
        <div className="task-grid" data-usage-context="home">
          {taskCards.map(({ title, description, href, icon: Icon, tone, status }) => {
            const content = (
              <>
                <span className="task-link__icon"><Icon size={22} aria-hidden="true" /></span>
                <span className="task-link__copy">
                  <small>{status === "로그인 필요" && session ? "계정 상태에 따라 이용" : status}</small>
                  <strong>{title}</strong>
                  <span>{description}</span>
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
            <p>COMMUNITY NOW</p>
            <h2 id="home-overview-title">지금 올라온 소식</h2>
          </div>
          <span>최근 경기와 커뮤니티 소식을 모았어요.</span>
        </div>
        {homeResult.state === "ready" ? (
          <div className="home-overview-grid">
            <article className="home-feed-panel" data-feed-kind="matches">
              <header><Swords aria-hidden="true" /><div><span>최근 경기</span><strong>{homeResult.snapshot.feeds.recentMatches.length}건</strong></div><Link href="/matches">전체 보기</Link></header>
              {homeResult.snapshot.feeds.recentMatches.length ? <ul>{homeResult.snapshot.feeds.recentMatches.map((match) => <li key={match.id}><Link href={`/matches/${match.id}`}><span><strong>{match.title}</strong><small>{dateLabel(match.occurredAt)} · BLUE {match.blueWins}:{match.redWins} RED</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <FeedEmpty>아직 공개 확정 경기가 없어요.</FeedEmpty>}
            </article>
            <article className="home-feed-panel" data-feed-kind="recruits">
              <header><UsersRound aria-hidden="true" /><div><span>진행 중 구인</span><strong>{homeResult.snapshot.feeds.recruits.length}건</strong></div><Link href="/recruits">전체 보기</Link></header>
              {homeResult.snapshot.feeds.recruits.length ? <ul>{homeResult.snapshot.feeds.recruits.map((recruit) => <li key={`${recruit.kind}-${recruit.id}`}><Link href={`/recruits#${recruit.kind.toLowerCase()}-${recruit.id}`}><span><strong>{recruit.title}</strong><small>{recruit.kind === "PARTY" ? "파티" : "스크림"} · {recruit.summary}</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <FeedEmpty>현재 진행 중인 파티·스크림 구인이 없어요.</FeedEmpty>}
            </article>
            <article className="home-feed-panel" data-feed-kind="competitions">
              <header><Trophy aria-hidden="true" /><div><span>대회 현황</span><strong>{homeResult.snapshot.feeds.competitions.length}건</strong></div><Link href="/competitions">전체 보기</Link></header>
              {homeResult.snapshot.feeds.competitions.length ? <ul>{homeResult.snapshot.feeds.competitions.map((competition) => <li key={`${competition.kind}-${competition.id}`}><Link href={competition.kind === "EVENT" ? `/competitions/events/${competition.id}` : `/competitions/destruction/${competition.id}`}><span><strong>{competition.title}</strong><small>{competition.kind === "EVENT" ? "이벤트전" : "멸망전"} · {({ DRAFT: "준비 중", RECRUITING: "모집 중", TEAM_BUILDING: "팀 구성 중", IN_PROGRESS: "진행 중", COMPLETED: "종료", CANCELLED: "취소" } as Record<string, string>)[competition.status] ?? "진행 현황"} · {competition.participantCount}명</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <FeedEmpty>공개된 이벤트전·멸망전이 아직 없어요.</FeedEmpty>}
            </article>
            <article className="home-feed-panel" data-feed-kind="champions">
              <header><Images aria-hidden="true" /><div><span>멸망전 우승 사진</span><strong>{destructionWinnerSlides.length}장</strong></div><Link href="/images">전체 보기</Link></header>
              {destructionWinnerSlides.length ? <MediaCarousel label="멸망전 우승 사진" slides={destructionWinnerSlides} sizes="(max-width: 820px) 100vw, 50vw" variant="compact" /> : <FeedEmpty>게시 완료된 멸망전 우승 사진이 아직 없어요.</FeedEmpty>}
            </article>
          </div>
        ) : (
          <div className={`home-data-state${homeResult.state === "error" ? " home-data-state--error" : ""}`} role={homeResult.state === "error" ? "alert" : "status"}>
            <span><Database aria-hidden="true" /> 새 소식 확인 필요</span><strong>지금은 최근 소식을 불러올 수 없어요.</strong><p>잠시 후 다시 확인해 주세요.</p>
          </div>
        )}
      </section>

      <section className="home-personal-section" aria-labelledby="home-personal-title">
        <div className="home-personal-copy">
          <span><Sparkles aria-hidden="true" /> FOR YOU</span>
          <h2 id="home-personal-title">내 활동 이어보기</h2>
          {account ? <><p><strong>{account.loginId}</strong> 계정은 현재 {accountStatusLabel[account.status]} 상태예요.</p><div className="home-personal-actions"><Link href="/account">내 계정</Link>{account.player ? <Link href={`/players/${account.player.id}`}>{account.player.riotId} 프로필</Link> : <Link href="/account?tab=player">플레이어 연결 확인</Link>}<Link href="/applications">내 참가 신청</Link><Link href="/matches/submissions">내 결과 접수</Link><Link href="/tools/team-balance/drafts">저장한 팀</Link></div></> : session ? <><p>계정 정보를 불러오지 못했어요. 내 계정에서 다시 확인해 주세요.</p><div className="home-personal-actions"><Link href="/account">계정에서 다시 확인</Link></div></> : <><p>로그인하면 계정 상태, 연결 플레이어와 참가 신청을 이 자리에서 바로 이어갈 수 있어요.</p><div className="home-personal-actions"><Link href="/login"><LogIn aria-hidden="true" /> 로그인</Link><Link href="/signup">가입하기</Link></div></>}
        </div>
        <div className="home-season-card" data-season-state={homeResult.state === "ready" && homeResult.snapshot.activeSeason ? "active" : "inactive"}>
          <CalendarDays aria-hidden="true" />
          <span>현재 시즌</span>
          {homeResult.state === "ready" && homeResult.snapshot.activeSeason ? <><strong>{homeResult.snapshot.activeSeason.name}</strong><small>{homeResult.snapshot.activeSeason.endsAt ? `${dateLabel(homeResult.snapshot.activeSeason.endsAt)} 종료 예정` : "종료 일정 미정"}</small><Link href="/applications">참가 현황 보기 <ArrowRight aria-hidden="true" /></Link></> : <><strong>{homeResult.state === "ready" ? "활성 시즌 없음" : "확인할 수 없음"}</strong><small>{homeResult.state === "ready" ? "새 시즌이 시작되면 알려 드릴게요." : "잠시 후 다시 확인해 주세요."}</small></>}
        </div>
      </section>

      <section className="home-status-section" aria-labelledby="home-status-title">
        <div className="section-heading">
          <div>
            <p>LIVE STATUS</p>
            <h2 id="home-status-title">지금 볼 수 있는 기록</h2>
          </div>
          <span>함께한 플레이어와 확정된 경기 기록을 확인하세요.</span>
        </div>
        <HomeDataState result={homeResult} />
        <div className="home-record-links"><Link href="/players">플레이어 전적 찾기 <ArrowRight size={16} aria-hidden="true" /></Link><Link href="/matches">지난 경기 둘러보기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
      </section>
    </div>
  );
}
