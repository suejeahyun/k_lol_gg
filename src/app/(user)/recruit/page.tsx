export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "@/lib/prisma/client";
import {
  formatRecruitPartyBlock,
  getActiveMemberCount,
  getKakaoRecruitDateKey,
  getRecruitStatusLabel,
  getRecruitTypeLabel,
  isLinePartyType,
  isSoloRankPartyType,
} from "@/lib/kakao/party-recruit";

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
          <span className={member ? "recruit-slot__name" : "recruit-slot__empty"}>{member?.name || "-"}</span>
        </div>
      );
    });
  }

  const slots = [];
  for (let slotNo = 1; slotNo <= party.maxMembers; slotNo += 1) {
    const member = party.members.find((item) => !item.isSubstitute && item.slotNo === slotNo);
    slots.push(
      <div key={slotNo} className="recruit-slot">
        <span className="recruit-slot__label">{slotNo}</span>
        <span className={member ? "recruit-slot__name" : "recruit-slot__empty"}>{member?.name || "-"}</span>
      </div>,
    );
  }

  if (party.type === "ARAM" || party.members.some((item) => item.isSubstitute)) {
    const subMembers = party.members.filter((item) => item.isSubstitute).map((item) => item.name).join(", ");
    slots.push(
      <div key="sub" className="recruit-slot recruit-slot--sub">
        <span className="recruit-slot__label">예비</span>
        <span className={subMembers ? "recruit-slot__name" : "recruit-slot__empty"}>{subMembers || "-"}</span>
      </div>,
    );
  }

  return slots;
}

export default async function RecruitPage() {
  const parties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS", recruitDate: getKakaoRecruitDateKey() },
    include: {
      members: {
        orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ recruitNo: "asc" }],
  });

  return (
    <main className="page-shell recruit-page">
      <section className="page-hero recruit-hero">
        <p className="page-kicker">KAKAO RECRUIT</p>
        <h1>구인구직 현황</h1>
        <p>
          카카오톡 구인구직방에서 생성된 자랭, 일반게임, 솔랭, 칼바람, 종합게임 파티 현황입니다.
        </p>
        <div className="recruit-command-box">
          <span>/자랭구인구직 12</span>
          <span>/일반게임구인구직 13</span>
          <span>/구인현황</span>
          <span>/12 쫑</span>
        </div>
      </section>

      {parties.length === 0 ? (
        <section className="recruit-empty card-panel">
          <h2>현재 모집중이거나 진행중인 구인글이 없습니다.</h2>
          <p>카카오톡 구인구직방에서 구인구직 명령어를 입력하면 이 페이지에 표시됩니다.</p>
        </section>
      ) : (
        <section className="recruit-grid" aria-label="현재 구인구직 파티 목록">
          {parties.map((party) => {
            const activeCount = getActiveMemberCount(party.members);
            const statusLabel = getRecruitStatusLabel(party);
            const typeLabel = getRecruitTypeLabel(party.type);
            const isFull = activeCount >= party.maxMembers;
            const isSoloRank = isSoloRankPartyType(party.type);

            return (
              <article key={party.id} className={`recruit-card${isFull ? " recruit-card--full" : ""}`}>
                <div className="recruit-card__head">
                  <div>
                    <div className="recruit-card__type">{typeLabel}</div>
                    <h2>{party.title.replace(/!$/, "")}</h2>
                  </div>
                  <div className="recruit-card__no">#{party.recruitNo}</div>
                </div>

                <div className="recruit-card__meta">
                  <span>{statusLabel}</span>
                  <span>{activeCount}/{party.maxMembers}</span>
                  {party.startTimeText ? <span>{party.startTimeText}</span> : null}
                  {isSoloRank && party.tierText ? <span>{party.tierText}</span> : null}
                  {isSoloRank && party.playStyle ? <span>{party.playStyle}</span> : null}
                  {isSoloRank && party.preferredLineText ? <span>{party.preferredLineText} 선호</span> : null}
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
  );
}
