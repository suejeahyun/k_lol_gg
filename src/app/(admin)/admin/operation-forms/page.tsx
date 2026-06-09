export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

const cards = [
  {
    key: "leaves",
    href: "/admin/operation-forms/leaves",
    title: "외출 신청",
    description: "외출기간 · 외출사유 · 외출범위",
  },
  {
    key: "meetups",
    href: "/admin/operation-forms/meetups",
    title: "오프라인 모임",
    description: "주최자 · 일자 · 장소 · 참여자 명단",
  },
  {
    key: "suggestions",
    href: "/admin/operation-forms/suggestions",
    title: "건의",
    description: "건의 사유 · 상세 내용",
  },
  {
    key: "friends",
    href: "/admin/operation-forms/friends",
    title: "디스코드 초대",
    description: "지인 이름 · 닉네임 · 이용기간 · 디코 닉변",
  },
  {
    key: "warnings",
    href: "/admin/operation-forms/warnings",
    title: "운영 경고 관리",
    description: "주의 · 경고 · 지각 · 노쇼 · 개별 초기화",
  },
] as const;

export default async function AdminOperationFormsPage() {
  const [leaves, meetups, suggestions, friends, warnings] = await Promise.all([
    prisma.kakaoLeaveRequest.count(),
    prisma.kakaoMeetupRecord.count(),
    prisma.kakaoSuggestionRequest.count(),
    prisma.kakaoFriendApplication.count(),
    prisma.userDisciplineRecord.count({ where: { isActive: true } }),
  ]);

  const counts: Record<(typeof cards)[number]["key"], number> = {
    leaves,
    meetups,
    suggestions,
    friends,
    warnings,
  };

  return (
    <main className="admin-page" style={{ width: "100%" }}>
      <div style={{ width: "min(100%, 1640px)", maxWidth: "calc(100vw - 48px)", margin: "0 auto" }}>
        <div className="admin-page__header" style={{ marginBottom: 28 }}>
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
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 22,
            width: "100%",
            alignItems: "stretch",
          }}
        >
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="admin-card"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: 190,
                padding: 28,
                borderRadius: 22,
                textDecoration: "none",
                color: "inherit",
                border: "1px solid rgba(56, 189, 248, 0.18)",
                background: "linear-gradient(180deg, rgba(9, 23, 50, 0.96), rgba(2, 6, 23, 0.92))",
                boxShadow: "0 18px 40px rgba(0, 0, 0, 0.22)",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 16,
                    marginBottom: 18,
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.2, wordBreak: "keep-all" }}>{card.title}</h2>
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: "1px solid rgba(34, 211, 238, 0.24)",
                      background: "rgba(15, 23, 42, 0.72)",
                      color: "#dbeafe",
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                    }}
                  >
                    총 {counts[card.key]}건
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: "rgba(226, 232, 240, 0.84)",
                    lineHeight: 1.7,
                    fontSize: "1rem",
                    wordBreak: "keep-all",
                  }}
                >
                  {card.description}
                </p>
              </div>

              <div
                style={{
                  marginTop: 28,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#67e8f9",
                  fontWeight: 700,
                  fontSize: "0.98rem",
                }}
              >
                바로 보기 <span aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
