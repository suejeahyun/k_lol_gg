export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import AccountProfileEditForm from "@/components/AccountProfileEditForm";
import AccountTierEditForm from "@/components/AccountTierEditForm";

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
        peakTier: user.player.peakTier,
        currentTier: user.player.currentTier,
      }
    : null;

  return (
    <main className="user-page account-page account-edit-page account-page--compact">
      <div className="user-page__header account-page__header">
        <div>
          <p className="account-page__kicker">PLAYER</p>
          <h1 className="user-page__title">플레이어 정보 수정</h1>
          <p className="user-page__description">닉네임/태그와 현재티어/최고티어를 각각 분리해서 수정합니다.</p>
        </div>
        <Link className="admin-button secondary" href="/account">
          내정보로 돌아가기
        </Link>
      </div>

      <section className="admin-card account-card account-edit-card">
        <div className="account-edit-summary">
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

        <div className="account-edit-split-grid">
          <section className="account-edit-panel account-edit-panel--profile">
            <AccountProfileEditForm player={editablePlayer} />
          </section>

          <section className="account-edit-panel account-edit-panel--tier">
            <AccountTierEditForm player={editablePlayer} />
          </section>
        </div>
      </section>
    </main>
  );
}
