export const dynamic = "force-dynamic";

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

        <section className="account-edit-panel account-edit-panel--profile account-edit-panel--single">
          <AccountProfileEditForm player={editablePlayer} />
        </section>
      </section>
    </main>
  );
}
