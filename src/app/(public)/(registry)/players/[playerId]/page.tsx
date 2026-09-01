import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Gamepad2, Hash, ShieldCheck, Sparkles, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { loadRuntimePlayerProfile } from "@/modules/players/infrastructure/runtime-player-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "플레이어 상세",
  description: "K-LOL.GG 플레이어의 공개 프로필과 기록 연결 상태를 확인합니다.",
};

function formatJoinedAt(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(value);
}
export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const result = await loadRuntimePlayerProfile(playerId);

  if (result.state === "ready" && !result.data) notFound();

  return (
    <div className="page-wrap player-detail-page">
      <Link className="back-link" href="/players"><ArrowLeft size={16} aria-hidden="true" /> 플레이어 목록</Link>

      {result.state === "unavailable" ? (
        <section className="detail-state" role="status" aria-labelledby="player-unavailable-title">
          <Sparkles size={34} aria-hidden="true" />
          <h1 id="player-unavailable-title">프로필 데이터 연결을 준비하고 있어요.</h1>
          <p>샘플 프로필을 대신 보여주지 않습니다. V2 전용 등록부가 연결되면 같은 주소에서 확인할 수 있습니다.</p>
        </section>
      ) : result.state === "error" ? (
        <section className="detail-state detail-state--error" role="alert" aria-labelledby="player-error-title">
          <Sparkles size={34} aria-hidden="true" />
          <h1 id="player-error-title">프로필을 불러오지 못했어요.</h1>
          <p>잠시 후 다시 시도하거나 플레이어 목록으로 돌아가 다른 프로필을 확인해 주세요.</p>
        </section>
      ) : result.data ? (
        <>
          <section className="player-detail-hero" aria-labelledby="player-title">
            <div className="player-detail-hero__avatar" aria-hidden="true">{result.data.displayName.slice(0, 1)}</div>
            <div>
              <Badge variant="secondary"><ShieldCheck size={13} aria-hidden="true" /> 공개 프로필</Badge>
              <h1 id="player-title">{result.data.displayName}</h1>
              <p><Hash size={14} aria-hidden="true" /> {result.data.riotId}</p>
            </div>
          </section>

          <section className="profile-summary" aria-labelledby="profile-summary-title">
            <div className="section-heading">
              <div><p>PROFILE</p><h2 id="profile-summary-title">프로필 요약</h2></div>
              <span>공개 allowlist 필드만 표시합니다.</span>
            </div>
            <div className="profile-summary__grid">
              <article><span>현재 티어</span><strong>{result.data.currentTier ?? "미등록"}</strong></article>
              <article><span>최고 티어</span><strong>{result.data.peakTier ?? "미등록"}</strong></article>
              <article><span><CalendarDays size={15} aria-hidden="true" /> 등록일</span><strong>{formatJoinedAt(result.data.joinedAt)}</strong></article>
            </div>
          </section>

          <section className="profile-records" aria-labelledby="profile-records-title">
            <div className="section-heading">
              <div><p>RECORDS</p><h2 id="profile-records-title">시즌·포지션·챔피언 기록</h2></div>
              <span>통계 스키마와 이관 검증 후 연결합니다.</span>
            </div>
            <div className="profile-records__grid">
              <article><Gamepad2 size={22} aria-hidden="true" /><strong>시즌 전적</strong><p>아직 연결되지 않았습니다.</p></article>
              <article><ShieldCheck size={22} aria-hidden="true" /><strong>포지션·챔피언</strong><p>아직 연결되지 않았습니다.</p></article>
              <article><Trophy size={22} aria-hidden="true" /><strong>최근 경기</strong><p>아직 연결되지 않았습니다.</p></article>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
