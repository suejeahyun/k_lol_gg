export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings } from "@/lib/site/settings";
import {
  buildGameInfoText,
  formatRecruitPartyBlock,
  getDisplayActiveMemberCount,
  getRecruitStatusLabel,
  getRecruitTypeLabel,
  isLinePartyType,
} from "@/lib/kakao/party-recruit";

export const metadata: Metadata = {
  title: "구인 현황",
  description: "K-LOL.GG에서 현재 진행 중인 내전 구인과 참가 현황을 확인하세요.",
  alternates: { canonical: "/recruit" },
};

type RecruitPageMember = {
  id: number;
  name: string;
  position: string | null;
  slotNo: number | null;
  isSubstitute: boolean;
};

type RecruitPageParty = {
  id: number;
  recruitNo: number;
  recruitDate: string;
  resetSeq: number;
  recruitCode: string | null;
  type: string;
  status: string;
  title: string;
  roomName: string | null;
  hostName: string | null;
  startTimeText: string | null;
  tierText: string | null;
  preferredLineText: string | null;
  playStyle: string | null;
  note: string | null;
  maxMembers: number;
  createdAt: Date;
  updatedAt: Date;
  members: RecruitPageMember[];
};

const LINE_POSITIONS = ["TOP", "JUG", "MID", "ADC", "SUP"];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderSlots(party: RecruitPageParty) {
  if (isLinePartyType(party.type)) {
    return LINE_POSITIONS.map((position) => {
      const member = party.members.find((item) => item.position === position);
      return (
        <div key={position} className="recruit-slot">
          <span className="recruit-slot__label">{position}</span>
          <span
            className={member ? "recruit-slot__name" : "recruit-slot__empty"}
          >
            {member?.name || "-"}
          </span>
        </div>
      );
    });
  }

  const slots = [];
  const maxWrittenSlotNo = Math.max(
    party.maxMembers,
    ...party.members
      .filter((item) => !item.isSubstitute && typeof item.slotNo === "number")
      .map((item) => Number(item.slotNo)),
  );

  for (let slotNo = 1; slotNo <= maxWrittenSlotNo; slotNo += 1) {
    const member = party.members.find(
      (item) => !item.isSubstitute && item.slotNo === slotNo,
    );
    slots.push(
      <div key={slotNo} className="recruit-slot">
        <span className="recruit-slot__label">{slotNo}</span>
        <span className={member ? "recruit-slot__name" : "recruit-slot__empty"}>
          {member?.name || "-"}
        </span>
      </div>,
    );
  }

  if (
    party.type === "ARAM" ||
    party.members.some((item) => item.isSubstitute)
  ) {
    const subMembers = party.members
      .filter((item) => item.isSubstitute)
      .map((item) => item.name)
      .join(", ");
    slots.push(
      <div key="sub" className="recruit-slot recruit-slot--sub">
        <span className="recruit-slot__label">예비</span>
        <span
          className={subMembers ? "recruit-slot__name" : "recruit-slot__empty"}
        >
          {subMembers || "-"}
        </span>
      </div>,
    );
  }

  return slots;
}

export default async function RecruitPage() {
  const siteSettings = await getSiteSettings();
  const parties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    select: {
      id: true,
      recruitNo: true,
      recruitDate: true,
      resetSeq: true,
      recruitCode: true,
      type: true,
      status: true,
      title: true,
      roomName: true,
      hostName: true,
      startTimeText: true,
      tierText: true,
      preferredLineText: true,
      playStyle: true,
      note: true,
      maxMembers: true,
      createdAt: true,
      updatedAt: true,
      members: {
        select: {
          id: true,
          name: true,
          position: true,
          slotNo: true,
          isSubstitute: true,
        },
        orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [
      { recruitDate: "desc" },
      { resetSeq: "desc" },
      { recruitNo: "asc" },
    ],
    take: 50,
  });

  return (
    <PremiumFeatureGate feature="recruit" settings={siteSettings}>
      <main className="page-shell recruit-page">
        <section className="page-hero recruit-hero">
          <p className="page-kicker">KAKAO RECRUIT</p>
          <h1>구인현황</h1>
          <p>카카오톡 구인 명령으로 등록된 실시간 모집과 참가 현황을 확인합니다.</p>
          <div className="recruit-command-box">
            <span>/6인파티</span>
            <span>/10인구인</span>
            <span>/5인협곡파티</span>
            <span>/구인현황</span>
            <span>/12ㅉ</span>
          </div>
        </section>

        {parties.length === 0 ? (
          <section className="recruit-empty card-panel">
            <p className="recruit-empty__eyebrow">NO ACTIVE RECRUIT</p>
            <h2>현재 모집 중인 구인이 없습니다.</h2>
            <p>
              새 구인이 등록되면 이 화면에 참가 인원과 남은 자리가 바로 표시됩니다.
            </p>
            <div className="recruit-empty__actions">
              <Link href="/kakao">카카오 이용 안내</Link>
              <Link href="/progress">진행 현황 보기</Link>
            </div>
          </section>
        ) : (
          <section className="recruit-grid" aria-label="현재 구인현황 목록">
            {parties.map((party) => {
              const displayActiveCount = getDisplayActiveMemberCount(
                party.members,
                party.maxMembers,
              );
              const statusLabel = getRecruitStatusLabel(party);
              const typeLabel = getRecruitTypeLabel(party.type);
              const gameInfo = buildGameInfoText(party);

              return (
                <article key={party.id} className="recruit-card">
                  <div className="recruit-card__head">
                    <div>
                      <div className="recruit-card__type">{typeLabel}</div>
                      <h2>{party.title.replace(/!$/, "")}</h2>
                    </div>
                    <div className="recruit-card__no">#{party.recruitNo}</div>
                  </div>

                  <div className="recruit-card__meta">
                    <span>{statusLabel}</span>
                    <span>
                      {party.recruitDate} · 회차 {party.resetSeq}
                    </span>
                    <span>
                      관리번호{" "}
                      {party.recruitCode ||
                        `${party.recruitDate}-${party.maxMembers}-${party.recruitNo}`}
                    </span>
                    <span>
                      {displayActiveCount}/{party.maxMembers}
                    </span>
                    {gameInfo ? <span>게임정보: {gameInfo}</span> : null}
                  </div>

                  <div className="recruit-slots">{renderSlots(party)}</div>

                  <div className="recruit-card__foot">
                    <span>최근 반영 {formatDate(party.updatedAt)}</span>
                    {party.hostName ? <span>생성자 {party.hostName}</span> : null}
                  </div>

                  <details className="recruit-raw">
                    <summary>카톡 현황 문구 보기</summary>
                    <pre>{formatRecruitPartyBlock(party)}</pre>
                  </details>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </PremiumFeatureGate>
  );
}
