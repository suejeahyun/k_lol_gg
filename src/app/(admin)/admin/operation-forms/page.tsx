export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

const cards = [
  { href: "/admin/operation-forms/friends", title: "지인 신청", description: "지인 이름, 닉네임, 이용기간, 디코 닉변" },
  { href: "/admin/operation-forms/suggestions", title: "건의", description: "건의 사유와 상세 내용" },
  { href: "/admin/operation-forms/meetups", title: "오프라인 모임", description: "주최자, 일자, 장소, 참여자 명단" },
  { href: "/admin/operation-forms/leaves", title: "외출 신청", description: "외출기간, 사유, 외출범위" },
];

export default async function AdminOperationFormsPage() {
  const [friends, suggestions, meetups, leaves] = await Promise.all([
    prisma.kakaoFriendApplication.count({ where: { status: "PENDING" } }),
    prisma.kakaoSuggestionRequest.count({ where: { status: "PENDING" } }),
    prisma.kakaoMeetupRecord.count({ where: { status: "PENDING" } }),
    prisma.kakaoLeaveRequest.count({ where: { status: "PENDING" } }),
  ]);
  const counts = [friends, suggestions, meetups, leaves];

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="page-eyebrow">KAKAO OPERATION</p>
          <h1>운영 신청 관리</h1>
          <p className="admin-page__description">카카오톡 봇으로 접수된 지인 신청, 건의, 모임, 외출 신청을 관리합니다.</p>
        </div>
      </div>

      <section className="admin-grid admin-grid--cards">
        {cards.map((card, index) => (
          <Link key={card.href} href={card.href} className="admin-card" style={{ textDecoration: "none", color: "inherit" }}>
            <p className="page-eyebrow">PENDING {counts[index]}</p>
            <h2>{card.title}</h2>
            <p>{card.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
