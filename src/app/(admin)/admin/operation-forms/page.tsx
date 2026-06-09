export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

const cards = [
  {
    key: "leaves",
    href: "/admin/operation-forms/leaves",
    title: "외출 신청",
    description: "외출기간, 외출사유, 외출범위",
  },
  {
    key: "meetups",
    href: "/admin/operation-forms/meetups",
    title: "오프라인 모임",
    description: "주최자, 일자, 장소, 참여자 명단",
  },
  {
    key: "suggestions",
    href: "/admin/operation-forms/suggestions",
    title: "건의",
    description: "건의 사유와 상세 내용",
  },
  {
    key: "friends",
    href: "/admin/operation-forms/friends",
    title: "디스코드 초대",
    description: "지인 이름, 닉네임, 이용기간, 디코 닉변",
  },
] as const;

export default async function AdminOperationFormsPage() {
  const [leaves, meetups, suggestions, friends] = await Promise.all([
    prisma.kakaoLeaveRequest.count(),
    prisma.kakaoMeetupRecord.count(),
    prisma.kakaoSuggestionRequest.count(),
    prisma.kakaoFriendApplication.count(),
  ]);

  const counts: Record<(typeof cards)[number]["key"], number> = {
    leaves,
    meetups,
    suggestions,
    friends,
  };

  return (
    <main className="admin-page" style={{ width: "100%" }}>
      <div style={{ width: "min(100%, 1500px)", maxWidth: "calc(100vw - 40px)", margin: "0 auto" }}>
        <div className="admin-page__header" style={{ marginBottom: 24 }}>
          <div>
            <p className="page-eyebrow">KAKAO OPERATION</p>
            <h1>운영 신청 관리</h1>
            <p className="admin-page__description">
              카카오톡 봇으로 접수된 외출, 모임, 건의, 디스코드 초대 신청을 관리합니다.
            </p>
          </div>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 18,
            width: "100%",
          }}
        >
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="admin-card"
              style={{
                display: "block",
                minHeight: 168,
                padding: 24,
                borderRadius: 18,
                textDecoration: "none",
                color: "inherit",
                border: "1px solid rgba(148, 163, 184, 0.22)",
                background: "linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(2, 6, 23, 0.78))",
                boxShadow: "0 18px 45px rgba(0, 0, 0, 0.26)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0 }}>{card.title}</h2>
                <span className="page-eyebrow" style={{ margin: 0, whiteSpace: "nowrap" }}>
                  총 {counts[card.key]}건
                </span>
              </div>
              <p style={{ margin: "18px 0 0", color: "rgba(226, 232, 240, 0.78)", lineHeight: 1.6 }}>
                {card.description}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
