import type { Metadata } from "next";
import Image from "next/image";
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
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { loadRuntimeHomeSnapshot } from "@/modules/home/infrastructure/runtime-home-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내전 커뮤니티 홈",
  description: "K-LOL.GG의 플레이어 기록과 내전 커뮤니티 소식을 확인하세요.",
  alternates: { canonical: "/" },
};

const taskCards = [
  {
    title: "플레이어 찾기",
    description: "공개 닉네임과 Riot ID로 빠르게 찾아보세요.",
    href: "/players",
    icon: UsersRound,
    tone: "sky",
    status: "이용 가능",
  },
  {
    title: "경기 살펴보기",
    description: "시즌·기간별 경기와 세트 기록을 한 흐름으로 확인하세요.",
    href: "/matches",
    icon: Swords,
    tone: "peach",
    status: "이용 가능",
  },
  {
    title: "팀 밸런스",
    description: "포지션과 확정 경기 지표를 고려해 균형 잡힌 팀을 만듭니다.",
    href: "/tools/team-balance",
    icon: ShieldCheck,
    tone: "mint",
    status: "이용 가능",
  },
  {
    title: "대회 진행",
    description: "시즌과 이벤트전 진행 단계를 보고 참가 신청을 이어가세요.",
    href: "/competitions",
    icon: Trophy,
    tone: "lilac",
    status: "이벤트전 이용 가능",
  },
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
        <span><Database size={18} aria-hidden="true" /> 최신 기록 확인 가능</span>
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
  const [homeResult, session] = await Promise.all([
    loadRuntimeHomeSnapshot(),
    getCurrentSession("ACCOUNT"),
  ]);
  const accountRepository = session ? getRuntimeAccountRepository() : null;
  const account = session && accountRepository
    ? await accountRepository.findSelf(session.userId).catch(() => null)
    : null;

  return (
    <div className="page-wrap home-page">
      <section className="hero-panel" aria-labelledby="home-title">
        <div className="hero-copy">
          <Badge className="foundation-badge" variant="secondary">
            <Sparkles size={13} aria-hidden="true" />
            K-LOL.GG · NEW SEASON
          </Badge>
          <p className="hero-kicker">함께 찾고, 함께 기록하는 내전 놀이터</p>
          <h1 id="home-title">
            필요한 기능을
            <span>한눈에, 가볍게.</span>
          </h1>
          <p className="hero-description">
            플레이어·경기·랭킹·팀 도구부터 이벤트와 커뮤니티 기록까지,
            데스크톱과 모바일에서 편안하게 이어서 이용하세요.
          </p>

          <form className="hero-search" action="/players" method="get">
            <label className="sr-only" htmlFor="home-player-search">
              플레이어 닉네임 또는 Riot ID
            </label>
            <Search aria-hidden="true" size={19} />
            <Input
              id="home-player-search"
              name="q"
              maxLength={80}
              placeholder="닉네임 또는 GameName#TAG 검색"
              autoComplete="off"
            />
            <Button size="lg" type="submit">찾아보기</Button>
          </form>

          <div className="hero-proof" aria-label="서비스 안내">
            <span><ShieldCheck size={15} aria-hidden="true" /> 필요한 정보만 깔끔하게</span>
            <span><Sparkles size={15} aria-hidden="true" /> 모바일·키보드 함께 지원</span>
          </div>
        </div>

        <div className="hero-art">
          <Image
            src="/images/brand/v2-hero-ahri-1600.webp"
            alt="하늘빛 꽃잎 사이에서 여우불을 띄운 여성 챔피언 아리"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 46vw"
          />
          <div className="hero-art__wash" aria-hidden="true" />
          <div className="hero-art__label">
            <span>오늘의 안내 챔피언</span>
            <strong>아리</strong>
            <small>오늘의 내전을 가볍게 시작해 보세요</small>
          </div>
        </div>
      </section>

      <section className="task-section" aria-labelledby="tasks-title">
        <div className="section-heading">
          <div>
            <p>QUICK START</p>
            <h2 id="tasks-title">무엇을 하러 왔나요?</h2>
          </div>
          <span>자주 쓰는 기능을 한 번에 시작할 수 있어요.</span>
        </div>
        <div className="task-grid">
          {taskCards.map(({ title, description, href, icon: Icon, tone, status }) => {
            const content = (
              <>
                <span className="task-link__icon"><Icon size={22} aria-hidden="true" /></span>
                <span className="task-link__copy">
                  <small>{status}</small>
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
          <span>게시 상태가 확인된 공개 데이터만 최신순으로 보여 드려요.</span>
        </div>
        {homeResult.state === "ready" ? (
          <div className="home-overview-grid">
            <article className="home-feed-panel">
              <header><Swords aria-hidden="true" /><div><span>최근 경기</span><strong>{homeResult.snapshot.feeds.recentMatches.length}건</strong></div><Link href="/matches">전체 보기</Link></header>
              {homeResult.snapshot.feeds.recentMatches.length ? <ul>{homeResult.snapshot.feeds.recentMatches.map((match) => <li key={match.id}><Link href={`/matches/${match.id}`}><span><strong>{match.title}</strong><small>{dateLabel(match.occurredAt)} · BLUE {match.blueWins}:{match.redWins} RED</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <FeedEmpty>아직 공개 확정 경기가 없어요.</FeedEmpty>}
            </article>
            <article className="home-feed-panel">
              <header><UsersRound aria-hidden="true" /><div><span>진행 중 구인</span><strong>{homeResult.snapshot.feeds.recruits.length}건</strong></div><Link href="/recruits">전체 보기</Link></header>
              {homeResult.snapshot.feeds.recruits.length ? <ul>{homeResult.snapshot.feeds.recruits.map((recruit) => <li key={`${recruit.kind}-${recruit.id}`}><Link href="/recruits"><span><strong>{recruit.title}</strong><small>{recruit.kind === "PARTY" ? "파티" : "스크림"} · {recruit.summary}</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <FeedEmpty>현재 진행 중인 파티·스크림 구인이 없어요.</FeedEmpty>}
            </article>
            <article className="home-feed-panel">
              <header><Trophy aria-hidden="true" /><div><span>대회 현황</span><strong>{homeResult.snapshot.feeds.competitions.length}건</strong></div><Link href="/competitions">전체 보기</Link></header>
              {homeResult.snapshot.feeds.competitions.length ? <ul>{homeResult.snapshot.feeds.competitions.map((competition) => <li key={`${competition.kind}-${competition.id}`}><Link href={competition.kind === "EVENT" ? `/competitions/events/${competition.id}` : `/competitions/destruction/${competition.id}`}><span><strong>{competition.title}</strong><small>{competition.kind === "EVENT" ? "이벤트전" : "멸망전"} · {competition.status} · {competition.participantCount}명</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <FeedEmpty>공개된 이벤트전·멸망전이 아직 없어요.</FeedEmpty>}
            </article>
            <article className="home-feed-panel">
              <header><Images aria-hidden="true" /><div><span>홈 갤러리</span><strong>{homeResult.snapshot.feeds.gallery.length}건</strong></div><Link href="/images">전체 보기</Link></header>
              {homeResult.snapshot.feeds.gallery.length ? <ul>{homeResult.snapshot.feeds.gallery.map((gallery) => <li key={gallery.id}><Link href={`/images/${gallery.id}`}><span><strong>{gallery.title}</strong><small>{gallery.description}</small></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <FeedEmpty>홈에 공개된 갤러리가 아직 없어요.</FeedEmpty>}
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
          {account ? <><p><strong>{account.loginId}</strong> 계정은 현재 {accountStatusLabel[account.status]} 상태예요.</p><div className="home-personal-actions"><Link href="/account">내 계정</Link>{account.player ? <Link href={`/players/${account.player.id}`}>{account.player.riotId} 프로필</Link> : <Link href="/account?tab=player">플레이어 연결 확인</Link>}<Link href="/applications">내 참가 신청</Link></div></> : session ? <><p>계정 정보를 불러오지 못했어요. 내 계정에서 다시 확인해 주세요.</p><div className="home-personal-actions"><Link href="/account">계정에서 다시 확인</Link></div></> : <><p>로그인하면 계정 상태, 연결 플레이어와 참가 신청을 이 자리에서 바로 이어갈 수 있어요.</p><div className="home-personal-actions"><Link href="/login"><LogIn aria-hidden="true" /> 로그인</Link><Link href="/signup">가입하기</Link></div></>}
        </div>
        <div className="home-season-card">
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
          <span>시즌·경기·구인 현황을 최신 기록으로 확인하세요.</span>
        </div>
        <HomeDataState result={homeResult} />
        {homeResult.state === "ready" ? <div className="home-feed-contract" aria-label="실제 공개 피드 건수"><span data-state="ready">최근 경기 <strong>{homeResult.snapshot.feeds.recentMatches.length}건</strong></span><span data-state="ready">구인 <strong>{homeResult.snapshot.feeds.recruits.length}건</strong></span><span data-state="ready">대회 <strong>{homeResult.snapshot.feeds.competitions.length}건</strong></span><span data-state="ready">홈 갤러리 <strong>{homeResult.snapshot.feeds.gallery.length}건</strong></span></div> : null}
      </section>
    </div>
  );
}
