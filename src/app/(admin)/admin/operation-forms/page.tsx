export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

const cards = [
  {
    key: "leaves",
    href: "/admin/operation-forms/leaves",
    title: "외출 신청",
    description: "외출 기간, 사유, 범위를 확인하고 관리자 메모를 보관합니다.",
  },
  {
    key: "meetups",
    href: "/admin/operation-forms/meetups",
    title: "오프라인 모임",
    description: "오프라인 모임 신청 내용을 확인하고 기록용으로 관리합니다.",
  },
  {
    key: "suggestions",
    href: "/admin/operation-forms/suggestions",
    title: "건의",
    description: "건의 사유와 내용을 확인하고 내부 처리 메모를 남깁니다.",
  },
] as const;

export default async function AdminOperationFormsPage() {
  const [leaves, meetups, suggestions] = await Promise.all([
    prisma.kakaoLeaveRequest.count({ where: { status: { not: "CANCELLED" } } }),
    prisma.kakaoMeetupRecord.count({ where: { status: { not: "CANCELLED" } } }),
    prisma.kakaoSuggestionRequest.count({ where: { status: { not: "CANCELLED" } } }),
  ]);

  const counts: Record<(typeof cards)[number]["key"], number> = {
    leaves,
    meetups,
    suggestions,
  };

  return (
    <main className="admin-page" style={{ width: "100%" }}>
      <div style={{ width: "min(100%, 1640px)", maxWidth: "calc(100vw - 48px)", margin: "0 auto" }}>
        <div className="admin-page__header" style={{ marginBottom: 28 }}>
          <div>
            <p className="page-eyebrow">KAKAO OPERATION</p>
            <h1>운영 신청 관리</h1>
            <p className="admin-muted" style={{ marginTop: 8 }}>
              외출신청, 오프라인모임, 건의는 정보 확인 및 보관용으로 관리합니다.
              운영 경고 관리는 별도 메뉴에서 기존 규칙 그대로 처리합니다.
            </p>
          </div>
          <Link className="admin-button admin-button--ghost" href="/admin/discipline">
            운영 경고 관리
          </Link>
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
                    marginBottom: 14,
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
                <p className="admin-muted" style={{ lineHeight: 1.6 }}>{card.description}</p>
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
                목록 보기 <span aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
