export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma/client";
import DisciplineManagerClient from "./DisciplineManagerClient";

export default async function AdminWarningsPage() {
  const [users, records] = await Promise.all([
    prisma.userAccount.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { player: true },
    }),
    prisma.userDisciplineRecord.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        userAccount: { select: { id: true, userId: true, role: true, status: true } },
        player: { select: { id: true, name: true, nickname: true, tag: true } },
      },
    }),
  ]);

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
      <style>{`
        .discipline-page { width: min(1480px, calc(100vw - 48px)); margin: 0 auto; }
        .discipline-page-shell { display: grid; gap: 22px; }
        .discipline-rule-card, .discipline-form-card, .discipline-table-card, .discipline-stat { border: 1px solid rgba(82, 164, 255, .22); background: rgba(9, 24, 48, .72); border-radius: 22px; box-shadow: 0 18px 48px rgba(0,0,0,.24); }
        .discipline-rule-card { padding: 24px 28px; }
        .discipline-rule-card h2, .discipline-form-card h2 { margin: 0 0 14px; }
        .discipline-rule-card ol { margin: 0; padding-left: 22px; display: grid; gap: 8px; color: rgba(235,245,255,.86); line-height: 1.6; }
        .discipline-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); gap: 14px; }
        .discipline-stat { padding: 20px; }
        .discipline-stat span { color: rgba(190,218,255,.75); display:block; margin-bottom: 8px; }
        .discipline-stat strong { font-size: 30px; }
        .discipline-form-card, .discipline-table-card { padding: 24px; }
        .discipline-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 18px; }
        .discipline-help { margin: -4px 0 14px; }
        .discipline-mode-row { display:flex; flex-wrap:wrap; gap:10px; margin: 0 0 16px; }
        .discipline-direct-note { border: 1px solid rgba(96,166,255,.22); background: rgba(4,14,32,.62); border-radius: 14px; padding: 13px 14px; color: rgba(210,232,255,.78); line-height: 1.55; }
        .discipline-direct-badge { display:inline-flex; margin-left:8px; padding:4px 8px; border-radius:999px; border:1px solid rgba(255,216,112,.35); background:rgba(255,196,64,.12); color:#ffe39d; font-size:12px; font-weight:900; vertical-align:middle; }
        .discipline-form-grid label { display: grid; gap: 8px; font-weight: 800; color: #bfe7ff; }
        .discipline-form-grid input, .discipline-form-grid select, .discipline-form-grid textarea { width: 100%; border-radius: 12px; border: 1px solid rgba(96,166,255,.28); background: rgba(2,10,24,.84); color: #f3fbff; padding: 12px 14px; }
        .discipline-form-grid textarea { min-height: 82px; resize: vertical; }
        .discipline-wide { grid-column: 1 / -1; }
        .discipline-table-wrap { overflow-x: auto; }
        .discipline-table th, .discipline-table td { vertical-align: top; }
        .discipline-reason { max-width: 420px; white-space: normal; line-height: 1.5; }
        .discipline-pill, .discipline-type { display: inline-flex; align-items:center; border-radius: 999px; padding: 6px 10px; font-weight: 900; border: 1px solid rgba(255,255,255,.12); }
        .discipline-pill.active { color:#9fffc7; background: rgba(24,180,95,.14); border-color: rgba(82,255,160,.35); }
        .discipline-pill.reset { color:#bdd1ea; background: rgba(120,140,170,.12); }
        .discipline-type.caution { color:#ffe58f; background: rgba(255,185,60,.14); border-color: rgba(255,214,102,.35); }
        .discipline-type.warning { color:#ffb3b3; background: rgba(255,76,76,.14); border-color: rgba(255,120,120,.35); }
        .discipline-actions { display:flex; flex-wrap: wrap; gap:8px; }
        @media (max-width: 860px) { .discipline-summary-grid, .discipline-form-grid { grid-template-columns: 1fr; } .discipline-page { width: min(100%, calc(100vw - 24px)); } }
      `}</style>
      <div className="admin-page__header" style={{ marginBottom: 24 }}>
        <div>
          <p className="page-eyebrow">KAKAO OPERATION</p>
          <h1>운영 경고 관리</h1>
          <p className="admin-page__description">내전 지각, 노쇼, 전챗/감정표현, 욕설/남탓/훈수 등 주의·경고를 관리합니다.</p>
        </div>
      </div>
      <DisciplineManagerClient targets={targets} initialRecords={records as any} />
    </main>
  );
}
