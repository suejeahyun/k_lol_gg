export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import AccountProfileEditForm from "@/components/AccountProfileEditForm";

export default async function AccountTierPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/account/tier");

  const user = await prisma.userAccount.findUnique({
    where: { id: session.userAccountId },
    include: { player: true },
  });
  if (!user) redirect("/login?next=/account/tier");

  const editablePlayer = user.player
    ? {
        nickname: user.player.nickname,
        tag: user.player.tag,
      }
    : null;

  return (
    <main className="user-page account-page account-edit-page account-page--compact">
      <div className="user-page__header account-page__header">
        <div>
          <p className="account-page__kicker">PLAYER</p>
          <h1 className="user-page__title">플레이어 정보 수정</h1>
        </div>
      </div>

      <section className="admin-card account-card account-edit-card">
        <div className="account-edit-summary">
          <div>
            <span>플레이어</span>
            <strong>{user.player ? `${user.player.name} / ${user.player.nickname}#${user.player.tag}` : "미연결"}</strong>
          </div>
          <div>
            <span>현재 티어 · Riot 동기화</span>
            <strong>{user.player?.currentTier || "-"}</strong>
          </div>
          <div>
            <span>최고 티어 · 자동 보정</span>
            <strong>{user.player?.peakTier || "-"}</strong>
          </div>
        </div>

        <div className="account-edit-split-grid">
          <section className="account-edit-panel account-edit-panel--profile">
            <AccountProfileEditForm player={editablePlayer} />
          </section>

          <section className="account-edit-panel account-edit-panel--tier">
            <div className="account-tier-auto-card">
              <p className="account-page__kicker">RIOT AUTO TIER</p>
              <h2>티어는 Riot API로 자동 반영됩니다.</h2>
              <p>
                현재 티어와 솔로랭크 전적은 닉네임#태그를 기준으로 Riot 계정을 연결한 뒤
                솔랭 동기화를 실행하면 자동으로 갱신됩니다. 수동 티어 입력은 더 이상 사용하지 않습니다.
              </p>
              <div className="account-tier-auto-card__steps">
                <span>1. 닉네임#태그 확인</span>
                <span>2. Riot 계정 연결</span>
                <span>3. 솔랭 동기화</span>
              </div>
              <div className="account-tier-auto-card__actions">
                <Link className="admin-button" href="/me/riot">Riot 연동하기</Link>
                <Link className="admin-button admin-button--ghost" href="/me/player">내 플레이어 정보</Link>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
