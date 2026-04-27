"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ParticipationData = {
  season: {
    id: number;
    name: string;
  } | null;
  event: {
    id: number;
    title: string;
    status: string;
  } | null;
  destruction: {
    id: number;
    title: string;
    status: string;
  } | null;
};

export default function ParticipationPage() {
  const [data, setData] = useState<ParticipationData>({
    season: null,
    event: null,
    destruction: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchParticipation() {
      try {
        const res = await fetch("/api/participation", {
          cache: "no-store",
        });

        const result = await res.json();

        if (!res.ok) {
          console.error("[PARTICIPATION_PAGE_ERROR]", result);
          return;
        }

        setData(result);
      } catch (error: unknown) {
        console.error("[PARTICIPATION_PAGE_FETCH_ERROR]", error);
      } finally {
        setLoading(false);
      }
    }

    fetchParticipation().catch((error: unknown) => {
      console.error("[PARTICIPATION_PAGE_PROMISE_ERROR]", error);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="page-container participation-page">
        <div className="admin-empty">내전 참가 정보를 불러오는 중입니다.</div>
      </div>
    );
  }

  return (
    <div className="page-container participation-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">내전 참가</h1>
          <p className="page-description">
            시즌내전, 이벤트 내전, 멸망전 모집 현황을 확인하고 참가 신청할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="participation-grid">
        <ParticipationCard
          title="시즌내전"
          description={data.season?.name ?? "활성 시즌이 없습니다."}
          status={data.season ? "모집 가능" : "없음"}
          href="/participation/season"
          disabled={!data.season}
        />

        <ParticipationCard
          title="이벤트 내전"
          description={data.event?.title ?? "등록된 이벤트 내전이 없습니다."}
          status={data.event ? getStatusLabel(data.event.status) : "없음"}
          href={data.event ? `/participation/event/${data.event.id}` : "#"}
          disabled={!data.event}
        />

        <ParticipationCard
          title="멸망전"
          description={data.destruction?.title ?? "등록된 멸망전이 없습니다."}
          status={
            data.destruction ? getStatusLabel(data.destruction.status) : "없음"
          }
          href={
            data.destruction
              ? `/participation/destruction/${data.destruction.id}`
              : "#"
          }
          disabled={!data.destruction}
        />
      </div>
    </div>
  );
}

function ParticipationCard({
  title,
  description,
  status,
  href,
  disabled,
}: {
  title: string;
  description: string;
  status: string;
  href: string;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <div className="participation-card participation-card--disabled">
        <div className="participation-card__top">
          <span>{status}</span>
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    );
  }

  return (
    <Link href={href} className="participation-card">
      <div className="participation-card__top">
        <span>{status}</span>
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <strong>참가 페이지로 이동</strong>
    </Link>
  );
}

function getStatusLabel(status: string) {
  if (status === "PLANNED") return "예정";
  if (status === "RECRUITING") return "모집 중";
  if (status === "TEAM_BUILDING") return "팀 구성 중";
  if (status === "IN_PROGRESS") return "진행 중";
  if (status === "COMPLETED") return "완료";
  if (status === "CANCELLED") return "취소";
  return status;
}