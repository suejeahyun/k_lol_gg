import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

function formatCount(value: number) {
  return value.toLocaleString("ko-KR");
}

export default async function AdminProgressSelectorPage() {
  const [
    eventTotal,
    eventActive,
    destructionTotal,
    destructionActive,
  ] = await Promise.all([
    prisma.eventMatch.count(),
    prisma.eventMatch.count({
      where: {
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
      },
    }),
    prisma.destructionTournament.count(),
    prisma.destructionTournament.count({
      where: {
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
      },
    }),
  ]);

  const cards = [
    {
      title: "이벤트 내전",
      description:
        "단판 이벤트부터 다팀 토너먼트까지 관리합니다. 참가자 모집, 팀 구성, 시드 배정, 대진표, 결과 입력을 처리합니다.",
      href: "/admin/progress/event",
      createHref: "/admin/progress/event/new",
      primaryLabel: "이벤트 내전 관리",
      createLabel: "이벤트 내전 생성",
      total: eventTotal,
      active: eventActive,
      points: [
        "포지션 내전은 점수 시드 기준",
        "비포지션 내전은 랜덤 시드 기준",
        "다팀 토너먼트와 BYE 자동 처리 지원",
      ],
    },
    {
      title: "멸망전",
      description:
        "팀장 포인트 경매, 랜덤 카드 추첨, 예선 방식 선택, 본선 4강 토너먼트까지 관리합니다.",
      href: "/admin/progress/destruction",
      createHref: "/admin/progress/destruction/new",
      primaryLabel: "멸망전 관리",
      createLabel: "멸망전 생성",
      total: destructionTotal,
      active: destructionActive,
      points: [
        "기본 예선: 전체 풀리그 BO3",
        "스위스/랜덤 방식은 라운드 수 설정",
        "본선 진출은 상위 4팀 고정",
      ],
    },
  ];

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">이벤트 / 멸망전 선택</h1>
          <p className="admin-page__description">
            관리할 진행 유형을 선택하세요. 좌측 사이드바의 이벤트/멸망전 메뉴는 이 선택 화면으로 이동합니다.
          </p>
        </div>
      </div>

      <div className="admin-event-list">
        {cards.map((card) => (
          <section key={card.href} className="admin-event-card">
            <div className="admin-event-card__main">
              <div className="admin-event-card__top">
                <span className="admin-event-card__status">
                  진행중 {formatCount(card.active)}개
                </span>
                <span className="admin-event-card__mode">
                  전체 {formatCount(card.total)}개
                </span>
              </div>

              <h2 className="admin-event-card__title">{card.title}</h2>
              <p className="admin-page__description">{card.description}</p>

              <div className="admin-event-card__counts">
                {card.points.map((point) => (
                  <span key={point}>{point}</span>
                ))}
              </div>
            </div>

            <div className="admin-event-card__actions">
              <Link href={card.href} className="admin-event-card__button">
                {card.primaryLabel}
              </Link>
              <Link href={card.createHref} className="admin-event-card__button admin-event-card__button--danger">
                {card.createLabel}
              </Link>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
