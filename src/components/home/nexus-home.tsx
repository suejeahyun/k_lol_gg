import Link from "next/link";
import type { CSSProperties } from "react";

import { ArrowRight, CalendarDays, Search, UsersRound } from "@/components/theme/theme-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NexusMascotArt } from "./nexus-mascot-art";

import styles from "./nexus-home.module.css";

const mascots = [
  { name: "NEXI", korean: "넥시", label: "함께의 시작", description: "언제나 여러분과 함께해요.", color: "#4e8cff", x: 12, alt: "푸른 눈과 검은 후드의 고양이 넥시" },
  { name: "VEX", korean: "벡스", label: "차분한 한 수", description: "차가운 눈빛 속, 다정한 마음.", color: "#aabfff", x: 260, alt: "은빛 털과 푸른 눈의 늑대 벡스" },
  { name: "RIN", korean: "린", label: "즐거움의 불씨", description: "오늘도 재밌게, 웃음은 더 크게!", color: "#ff6ca7", x: 508, alt: "분홍빛 귀와 검은 후드의 여우 린" },
  { name: "ZANE", korean: "제인", label: "단단한 마음", description: "묵묵하게 빛나는 보랏빛 에너지.", color: "#a476ff", x: 758, alt: "보랏빛 눈과 검은 비늘의 드래곤 제인" },
  { name: "LUMI", korean: "루미", label: "반짝이는 응원", description: "좋은 건 같이, 웃음은 나누며.", color: "#8bb7ff", x: 1008, alt: "긴 흰 귀와 헤드셋의 토끼 루미" },
] as const;

export function NexusHomeHero() {
  return (
    <section className={styles.hero} aria-labelledby="home-title" data-nexus-section="hero">
      <div className={styles.heroCopy}>
        <div className={styles.eyebrow}><span aria-hidden="true" /> GAME · FRIENDS · COMMUNITY</div>
        <h1 id="home-title">함께하는 순간,<span>더 특별한 우리</span></h1>
        <p className={styles.description}>한 판의 즐거움부터 쌓여가는 우리 기록까지.<br />내전도, 파티도 NEXUS에서 함께해요.</p>
        <div className={styles.actions}>
          <Link href="/applications" className={styles.primaryAction}><CalendarDays size={19} aria-hidden="true" /> 오늘 내전 참가 <ArrowRight size={17} aria-hidden="true" /></Link>
          <Link href="/recruits" className={styles.secondaryAction}><UsersRound size={19} aria-hidden="true" /> 파티 찾기</Link>
        </div>
        <form className={styles.search} action="/players" method="get">
          <label className="sr-only" htmlFor="home-player-search">플레이어 전적 검색: 회원명, 닉네임 또는 Riot ID</label>
          <Search size={19} aria-hidden="true" />
          <Input id="home-player-search" name="q" maxLength={80} placeholder="플레이어 닉네임 · Riot ID" autoComplete="off" />
          <Button type="submit" size="lg">전적 검색</Button>
        </form>
        <Link className={styles.startLink} href="/start">처음 오셨나요? 이용 안내 <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <div className={styles.heroVisual}>
        <div className={styles.orbit} aria-hidden="true" />
        <span className={styles.visualWordmark} aria-hidden="true">NEXUS</span>
        <NexusMascotArt crop={[435, 0, 560, 300]} alt="푸른 눈으로 윙크하는 NEXUS의 대표 마스코트 넥시" className={styles.heroMascot} preload />
        <div className={styles.mascotCaption}><span>NEXUS MASCOT</span><strong>NEXI<span aria-hidden="true">✦</span></strong><p>“같이 하자냥!”</p></div>
        <span className={styles.visualCorner} aria-hidden="true">01 / THE BEGINNING</span>
      </div>
    </section>
  );
}

export function NexusMascotCrew() {
  return (
    <section className={styles.crew} aria-labelledby="nexus-crew-title" data-nexus-section="crew">
      <header className={styles.crewHeading}>
        <div><p className={styles.crewEyebrow}>MEET THE NEXUS CREW</p><h2 id="nexus-crew-title">다른 성격, 같은 마음</h2></div>
        <p>우리의 즐거운 순간을 함께할 다섯 친구.</p>
      </header>
      <ul className={styles.crewGrid} aria-label="NEXUS 마스코트 다섯 친구" tabIndex={0}>
        {mascots.map((mascot, index) => (
          <li className={styles.crewCard} key={mascot.name} style={{ "--mascot-accent": mascot.color } as CSSProperties}>
            <div className={styles.portrait}>
              <NexusMascotArt crop={[mascot.x, 310, 236, 332]} alt={mascot.alt} />
              <span className={styles.crewNumber} aria-hidden="true">0{index + 1}</span>
              <span className={styles.crewPersonality}>{mascot.label}</span>
            </div>
            <div className={styles.crewCopy}><h3>{mascot.name}<span>{mascot.korean}</span></h3><p>{mascot.description}</p></div>
          </li>
        ))}
      </ul>
      <p className={styles.scrollHint}>옆으로 넘겨 다섯 친구를 만나보세요 <ArrowRight size={14} aria-hidden="true" /></p>
    </section>
  );
}
