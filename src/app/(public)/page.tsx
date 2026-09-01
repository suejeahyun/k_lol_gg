import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Crown,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const taskCards = [
  {
    title: "플레이어 찾기",
    description: "닉네임과 Riot ID로 빠르게 찾아보세요.",
    href: "/players",
    icon: UsersRound,
    tone: "sky",
    status: "S02 시제품",
  },
  {
    title: "내전 살펴보기",
    description: "경기 일정과 결과를 한 흐름으로 정리합니다.",
    href: "#roadmap",
    icon: Swords,
    tone: "peach",
    status: "설계 중",
  },
  {
    title: "팀 밸런스",
    description: "포지션과 실력을 고려한 팀 구성을 준비합니다.",
    href: "#roadmap",
    icon: ShieldCheck,
    tone: "mint",
    status: "예정",
  },
  {
    title: "대회 진행",
    description: "시즌·이벤트·멸망전을 보기 쉽게 모읍니다.",
    href: "#roadmap",
    icon: Trophy,
    tone: "lilac",
    status: "예정",
  },
] as const;

export default function HomePage() {
  return (
    <div className="page-wrap home-page">
      <section className="hero-panel" aria-labelledby="home-title">
        <div className="hero-copy">
          <Badge className="foundation-badge" variant="secondary">
            <Sparkles size={13} aria-hidden="true" />
            V2 FOUNDATION · S00
          </Badge>
          <p className="hero-kicker">다시, 제대로 쌓는 K-LOL.GG</p>
          <h1 id="home-title">
            내전의 모든 순간을
            <span>더 쉽고 사랑스럽게.</span>
          </h1>
          <p className="hero-description">
            기존 코드를 복사하지 않고 기능 계약부터 새로 설계합니다. 플레이어 찾기 계약
            시제품으로 기반을 검증한 뒤 인증·권한부터 순서대로 완성합니다.
          </p>

          <form className="hero-search" action="/players" method="get">
            <label className="sr-only" htmlFor="home-player-search">
              플레이어 이름 또는 Riot ID
            </label>
            <Search aria-hidden="true" size={19} />
            <Input
              id="home-player-search"
              name="q"
              placeholder="플레이어 이름 또는 Riot ID 검색"
              autoComplete="off"
            />
            <Button size="lg" type="submit">
              찾아보기
            </Button>
          </form>

          <div className="hero-proof" aria-label="V2 개발 원칙">
            <span>
              <ShieldCheck size={15} /> 운영 데이터와 완전 분리
            </span>
            <span>
              <Sparkles size={15} /> 모바일부터 함께 설계
            </span>
          </div>
        </div>

        <div className="hero-art" aria-label="여성 챔피언 비주얼 영역">
          <Image
            src="/images/brand/v2-hero-ahri.png"
            alt="하늘과 꽃잎 사이에서 마법을 사용하는 여성 챔피언 아리"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 46vw"
          />
          <div className="hero-art__wash" />
          <div className="hero-art__label">
            <span>오늘의 안내 챔피언</span>
            <strong>아리</strong>
            <small>V1 자산을 복사하지 않은 V2 전용 비주얼</small>
          </div>
        </div>
      </section>

      <section className="task-section" aria-labelledby="tasks-title">
        <div className="section-heading">
          <div>
            <p>QUICK START</p>
            <h2 id="tasks-title">무엇을 하러 왔나요?</h2>
          </div>
          <span>필요한 기능부터 곧바로 찾을 수 있게 설계합니다.</span>
        </div>
        <div className="task-grid">
          {taskCards.map(({ title, description, href, icon: Icon, tone, status }) => (
            <Link className={`task-link task-link--${tone}`} href={href} key={title}>
              <span className="task-link__icon">
                <Icon size={22} aria-hidden="true" />
              </span>
              <span className="task-link__copy">
                <small>{status}</small>
                <strong>{title}</strong>
                <span>{description}</span>
              </span>
              <ArrowRight className="task-link__arrow" size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="foundation-grid" id="roadmap" aria-labelledby="roadmap-title">
        <Card className="roadmap-card">
          <CardHeader>
            <div className="card-eyebrow">
              <CalendarDays size={16} /> BUILD ORDER
            </div>
            <CardTitle id="roadmap-title">기능을 쌓는 순서</CardTitle>
            <CardDescription>기반과 권한을 먼저 잠그고 사용자 기능을 수직으로 완성합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="roadmap-list">
              <li data-state="active">
                <span>00</span>
                <div>
                  <strong>기반·디자인 시스템</strong>
                  <small>공통 상태·CI 구축 완료</small>
                </div>
              </li>
              <li data-state="next">
                <span>01</span>
                <div>
                  <strong>인증·권한</strong>
                  <small>다음 구현</small>
                </div>
              </li>
              <li data-state="prototype">
                <span>02</span>
                <div>
                  <strong>플레이어 등록부</strong>
                  <small>합성 데이터 계약 시제품</small>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>시즌·경기</strong>
                  <small>기능 계약 정리 중</small>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card className="principle-card">
          <CardHeader>
            <div className="card-eyebrow">
              <Crown size={16} /> V2 PRINCIPLES
            </div>
            <CardTitle>완성의 기준</CardTitle>
            <CardDescription>페이지 수가 아니라 동작과 검증 증거로 완성도를 판단합니다.</CardDescription>
          </CardHeader>
          <CardContent className="principle-list">
            <div>
              <strong>0</strong>
              <span>운영 DB 직접 연결</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>V1 기능 계약 매핑</span>
            </div>
            <div>
              <strong>AA</strong>
              <span>핵심 화면 접근성</span>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
