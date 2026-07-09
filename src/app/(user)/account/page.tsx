export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";


export default async function AccountPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/account");

  const user = await prisma.userAccount.findUnique({
    where: { id: session.userAccountId },
    include: {
      player: true,
    },
  });
  if (!user) redirect("/login?next=/account");


  return (
    <main className="user-page account-page account-page--compact">
      <div className="user-page__header account-page__header">
        <div>
          <h1 className="user-page__title">내 정보</h1>
        </div>
      </div>

      <section className="admin-card account-card account-summary-card">
        <div className="admin-section-head">
          <div>
            <h2>계정 정보</h2>
            <p className="admin-muted">아이디 {user.userId} · 상태 {user.status} · 권한 {user.role}</p>
          </div>
        </div>

        <div className="account-info-grid">
          <div>
            <span>플레이어</span>
            <strong>{user.player ? `${user.player.name} / ${user.player.nickname}#${user.player.tag}` : "미연결"}</strong>
          </div>
          <div>
            <span>현재 티어</span>
            <strong>{user.player?.currentTier || "-"}</strong>
          </div>
          <div>
            <span>최고 티어</span>
            <strong>{user.player?.peakTier || "-"}</strong>
          </div>
        </div>
      </section>

      <section className="account-action-grid" aria-label="내정보 수정 메뉴">
        <Link className="account-action-card" href="/account/tier">
          <span className="account-action-card__eyebrow">PLAYER</span>
          <strong>Riot ID / 플레이어 정보</strong>
          <p>닉네임과 태그를 확인하고, 티어는 Riot API 동기화로 자동 반영합니다.</p>
          <span className="account-action-card__cta">관리하기</span>
        </Link>

        <Link className="account-action-card" href="/me/riot">
          <span className="account-action-card__eyebrow">RIOT</span>
          <strong>Riot 계정 연동</strong>
          <p>닉네임#태그 검증 후 솔랭 티어와 최근 전적을 자동 동기화합니다.</p>
          <span className="account-action-card__cta">확인하기</span>
        </Link>

        <Link className="account-action-card" href="/account/password">
          <span className="account-action-card__eyebrow">SECURITY</span>
          <strong>비밀번호 변경</strong>
          <p>현재 비밀번호 확인 후 새 비밀번호로 변경합니다.</p>
          <span className="account-action-card__cta">변경하기</span>
        </Link>
      </section>
    </main>
  );
}
