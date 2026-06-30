export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import DisciplineRecordCreateClient from "@/components/admin/DisciplineRecordCreateClient";

export default async function AdminDisciplineNewPage() {
  const users = await prisma.userAccount.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { player: true },
  });

  const targets = users.map((user) => ({
    userAccountId: user.id,
    playerId: user.player?.id || null,
    userId: user.userId,
    name: user.player?.name || user.userId,
    nickname: user.player?.nickname || null,
    tag: user.player?.tag || null,
    label: `${user.player?.name || user.userId}${user.player ? ` · ${user.player.nickname}#${user.player.tag}` : ""} · ${user.userId}`,
  }));

  return (
    <main className="admin-page discipline-page">
      <DisciplineCreateStyles />
      <div className="admin-page__header" style={{ marginBottom: 24 }}>
        <div>
          <p className="page-eyebrow">DISCIPLINE CREATE</p>
          <h1>주의 등록</h1>
          <p className="admin-muted" style={{ marginTop: 8 }}>주의/경고 등록은 목록과 분리했습니다.</p>
        </div>
        <Link className="admin-button admin-button--ghost" href="/admin/discipline">목록</Link>
      </div>
      <DisciplineRecordCreateClient targets={targets} />
    </main>
  );
}

function DisciplineCreateStyles() {
  return <style>{`
    .discipline-page { width: min(1120px, calc(100vw - 56px)); margin: 0 auto; padding-bottom: 64px; }
    .discipline-form-card { border: 1px solid rgba(82, 164, 255, .24); background: linear-gradient(180deg, rgba(10, 28, 55, .86), rgba(5, 15, 34, .76)); border-radius: 22px; box-shadow: 0 18px 48px rgba(0,0,0,.24); padding: 24px; }
    .discipline-form-card h2 { margin: 0 0 14px; letter-spacing: -.02em; }
    .discipline-help { margin: -4px 0 14px; line-height: 1.55; }
    .discipline-mode-row { display:flex; flex-wrap:wrap; gap:10px; margin: 0 0 18px; }
    .discipline-form-grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 16px; margin-bottom: 18px; }
    .discipline-form-grid label { display: grid; gap: 8px; font-weight: 800; color: #bfe7ff; font-size: 13px; }
    .discipline-form-grid input, .discipline-form-grid select, .discipline-form-grid textarea { width: 100%; min-height: 44px; border-radius: 12px; border: 1px solid rgba(96,166,255,.30); background: rgba(2,10,24,.88); color: #f3fbff; padding: 11px 13px; outline: none; }
    .discipline-form-grid textarea { min-height: 96px; resize: vertical; line-height: 1.55; }
    .discipline-wide { grid-column: 1 / -1; }
    .discipline-direct-note { border: 1px solid rgba(96,166,255,.22); background: rgba(4,14,32,.62); border-radius: 14px; padding: 13px 14px; color: rgba(210,232,255,.78); line-height: 1.55; font-size: 13px; }
    @media (max-width: 860px) { .discipline-page { width: min(100%, calc(100vw - 20px)); } .discipline-form-grid { grid-template-columns: 1fr; } .discipline-form-card { padding: 18px; } }
  `}</style>;
}
