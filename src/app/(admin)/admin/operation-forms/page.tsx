export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

const cards = [
  {
    key: "leaves",
    href: "/admin/operation-forms/leaves",
    title: "외출 신청",
    code: "LEAVE",
  },
  {
    key: "meetups",
    href: "/admin/operation-forms/meetups",
    title: "오프라인 모임",
    code: "MEETUP",
  },
  {
    key: "suggestions",
    href: "/admin/operation-forms/suggestions",
    title: "건의",
    code: "SUGGEST",
  },
  {
    key: "friends",
    href: "/admin/operation-forms/friends",
    title: "디스코드 초대",
    code: "INVITE",
  },
] as const;

export default async function AdminOperationFormsPage() {
  const [leaves, meetups, suggestions, friends] = await Promise.all([
    prisma.kakaoLeaveRequest.count({ where: { status: { not: "CANCELLED" } } }),
    prisma.kakaoMeetupRecord.count({ where: { status: { not: "CANCELLED" } } }),
    prisma.kakaoSuggestionRequest.count({ where: { status: { not: "CANCELLED" } } }),
    prisma.kakaoFriendApplication.count({ where: { status: { not: "CANCELLED" } } }),
  ]);

  const counts: Record<(typeof cards)[number]["key"], number> = {
    leaves,
    meetups,
    suggestions,
    friends,
  };

  return (
    <main className="admin-page" style={{ width: "100%" }}>
      <div style={{ width: "min(100%, 1640px)", maxWidth: "calc(100vw - 48px)", margin: "0 auto" }}>
        <div className="admin-page__header" style={{ marginBottom: 28 }}>
          <div>
            <p className="page-eyebrow">KAKAO OPERATION</p>
            <h1>운영 신청 관리</h1>
          </div>
        </div>

        <section className="admin-operation-hub">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="admin-card admin-operation-hub__row"
            >
              <div className="admin-operation-hub__main">
                <span className="admin-operation-hub__code">{card.code}</span>
                <h2>{card.title}</h2>
              </div>
              <div className="admin-operation-hub__meta">
                <strong>{counts[card.key].toLocaleString("ko-KR")}</strong>
                <span>접수</span>
              </div>
              <span className="admin-operation-hub__arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
