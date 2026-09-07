import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Database,
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
import { loadRuntimeHomeSnapshot } from "@/modules/home/infrastructure/runtime-home-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내전 커뮤니티 홈",
  description: "K-LOL.GG V2의 공개 플레이어 등록부와 구현 상태를 확인하세요.",
  alternates: { canonical: "/" },
};

const taskCards = [
  {
    title: "플레이어 찾기",
    description: "공개 닉네임과 Riot ID로 빠르게 찾아보세요.",
    href: "/players",
    icon: UsersRound,
    tone: "sky",
    status: "페이지 준비",
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
    description: "시즌·이벤트·멸망전 진행 단계를 보기 쉽게 모읍니다.",
    href: null,
    icon: Trophy,
    tone: "lilac",
    status: "준비 중",
  },
] as const;

function HomeDataState({ result }: { result: Awaited<ReturnType<typeof loadRuntimeHomeSnapshot>> }) {
  if (result.state === "ready") {
    return (
      <div className="home-data-state home-data-state--ready" role="status">
        <span><Database size={18} aria-hidden="true" /> 공개 등록부 연결됨</span>
        <strong>{result.snapshot.activePlayerCount.toLocaleString("ko-KR")}명 · {result.snapshot.publishedMatchCount.toLocaleString("ko-KR")}경기</strong>
        <p>활성 플레이어와 공개 확정 경기 수입니다. 활성 시즌은 {result.snapshot.activeSeasonCount.toLocaleString("ko-KR")}개이며 비공개 계정 필드는 조회하지 않습니다.</p>
      </div>
    );
  }

  if (result.state === "error") {
    return (
      <div className="home-data-state home-data-state--error" role="alert">
        <span><Database size={18} aria-hidden="true" /> 일시적인 조회 오류</span>
        <strong>공개 현황을 불러오지 못했어요.</strong>
        <p>검색 화면은 열 수 있으며 데이터 연결이 회복되면 다시 조회할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="home-data-state" role="status">
      <span><Database size={18} aria-hidden="true" /> 데이터 연결 전</span>
      <strong>운영 데이터 대신 빈 상태를 표시합니다.</strong>
      <p>V2 전용 PostgreSQL이 명시적으로 연결되기 전에는 샘플 수치를 만들어 보여주지 않습니다.</p>
    </div>
  );
}

export default async function HomePage() {
  const homeResult = await loadRuntimeHomeSnapshot();

  return (
    <div className="page-wrap home-page">
      <section className="hero-panel" aria-labelledby="home-title">
        <div className="hero-copy">
          <Badge className="foundation-badge" variant="secondary">
            <Sparkles size={13} aria-hidden="true" />
            V2 · USER WAVE 01
          </Badge>
          <p className="hero-kicker">함께 찾고, 함께 기록하는 내전 놀이터</p>
          <h1 id="home-title">
            필요한 기능을
            <span>한눈에, 가볍게.</span>
          </h1>
          <p className="hero-description">
            데스크톱과 모바일에서 같은 주소와 같은 흐름을 사용합니다. 플레이어·경기·랭킹·
            팀 도구를 연결했고, 준비되지 않은 데이터는 있는 것처럼 꾸미지 않습니다.
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

          <div className="hero-proof" aria-label="V2 사용자 영역 원칙">
            <span><ShieldCheck size={15} aria-hidden="true" /> 공개 DTO만 표시</span>
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
            <small>V2 전용으로 제작한 밝은 홈 비주얼</small>
          </div>
        </div>
      </section>

      <section className="task-section" aria-labelledby="tasks-title">
        <div className="section-heading">
          <div>
            <p>QUICK START</p>
            <h2 id="tasks-title">무엇을 하러 왔나요?</h2>
          </div>
          <span>사용할 수 있는 기능과 준비 중인 기능을 분명하게 구분합니다.</span>
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

      <section className="home-status-section" aria-labelledby="home-status-title">
        <div className="section-heading">
          <div>
            <p>LIVE STATUS</p>
            <h2 id="home-status-title">공개 데이터 연결 상태</h2>
          </div>
          <span>준비되지 않은 시즌·경기·구인 수치는 표시하지 않습니다.</span>
        </div>
        <HomeDataState result={homeResult} />
        <div className="home-feed-contract" aria-label="홈 피드 구현 상태">
          <span data-state="ready">플레이어 등록부 <strong>페이지·포트 준비</strong></span>
          <span data-state="ready">시즌 요약 <strong>DB 연결</strong></span>
          <span data-state="ready">최근 경기 <strong>DB 연결</strong></span>
          <span>구인·대회·갤러리 <strong>구현 진행 중</strong></span>
        </div>
      </section>
    </div>
  );
}
