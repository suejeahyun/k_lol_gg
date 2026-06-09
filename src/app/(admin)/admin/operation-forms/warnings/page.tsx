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
        .discipline-page {
          width: min(1680px, calc(100vw - 56px));
          margin: 0 auto;
          padding-bottom: 64px;
        }
        .discipline-page-shell { display: grid; gap: 22px; }
        .discipline-rule-card,
        .discipline-form-card,
        .discipline-table-card,
        .discipline-stat {
          border: 1px solid rgba(82, 164, 255, .24);
          background: linear-gradient(180deg, rgba(10, 28, 55, .86), rgba(5, 15, 34, .76));
          border-radius: 22px;
          box-shadow: 0 18px 48px rgba(0,0,0,.24);
        }
        .discipline-rule-card { padding: 24px 28px; }
        .discipline-rule-card h2,
        .discipline-form-card h2,
        .discipline-table-card h2 { margin: 0 0 14px; letter-spacing: -.02em; }
        .discipline-rule-card ol {
          margin: 0;
          padding-left: 22px;
          display: grid;
          gap: 7px;
          color: rgba(235,245,255,.88);
          line-height: 1.62;
          font-size: 14px;
        }
        .discipline-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(190px, 1fr));
          gap: 14px;
        }
        .discipline-stat { padding: 20px 22px; min-height: 106px; display: grid; align-content: center; }
        .discipline-stat span { color: rgba(190,218,255,.75); display:block; margin-bottom: 8px; font-size: 13px; }
        .discipline-stat strong { font-size: 32px; line-height: 1; letter-spacing: -.03em; }
        .discipline-form-card,
        .discipline-table-card { padding: 24px; }
        .discipline-help { margin: -4px 0 14px; line-height: 1.55; }
        .discipline-mode-row { display:flex; flex-wrap:wrap; gap:10px; margin: 0 0 18px; }
        .discipline-form-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
          gap: 16px;
          margin-bottom: 18px;
        }
        .discipline-form-grid label { display: grid; gap: 8px; font-weight: 800; color: #bfe7ff; font-size: 13px; }
        .discipline-form-grid input,
        .discipline-form-grid select,
        .discipline-form-grid textarea {
          width: 100%;
          min-height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(96,166,255,.30);
          background: rgba(2,10,24,.88);
          color: #f3fbff;
          padding: 11px 13px;
          outline: none;
        }
        .discipline-form-grid input:focus,
        .discipline-form-grid select:focus,
        .discipline-form-grid textarea:focus {
          border-color: rgba(50, 210, 255, .72);
          box-shadow: 0 0 0 3px rgba(50, 180, 255, .12);
        }
        .discipline-form-grid textarea { min-height: 86px; resize: vertical; line-height: 1.55; }
        .discipline-wide { grid-column: 1 / -1; }
        .discipline-direct-note {
          border: 1px solid rgba(96,166,255,.22);
          background: rgba(4,14,32,.62);
          border-radius: 14px;
          padding: 13px 14px;
          color: rgba(210,232,255,.78);
          line-height: 1.55;
          font-size: 13px;
        }
        .discipline-table-wrap { overflow-x: auto; border-radius: 18px; }
        .discipline-table { min-width: 1120px; table-layout: fixed; }
        .discipline-table th,
        .discipline-table td { vertical-align: middle; padding: 14px 14px; }
        .discipline-table th:nth-child(1), .discipline-table td:nth-child(1) { width: 86px; }
        .discipline-table th:nth-child(2), .discipline-table td:nth-child(2) { width: 210px; }
        .discipline-table th:nth-child(3), .discipline-table td:nth-child(3) { width: 140px; }
        .discipline-table th:nth-child(4), .discipline-table td:nth-child(4) { width: auto; }
        .discipline-table th:nth-child(5), .discipline-table td:nth-child(5) { width: 170px; }
        .discipline-table th:nth-child(6), .discipline-table td:nth-child(6) { width: 170px; }
        .discipline-table th:nth-child(7), .discipline-table td:nth-child(7) { width: 190px; }
        .discipline-reason { white-space: normal; line-height: 1.55; word-break: keep-all; overflow-wrap: anywhere; }
        .discipline-target-main { display:flex; align-items:center; gap:8px; min-width: 0; }
        .discipline-target-main strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .discipline-direct-badge {
          display:inline-flex;
          padding:4px 8px;
          border-radius:999px;
          border:1px solid rgba(255,216,112,.35);
          background:rgba(255,196,64,.12);
          color:#ffe39d;
          font-size:12px;
          font-weight:900;
          vertical-align:middle;
          flex: 0 0 auto;
        }
        .discipline-pill,
        .discipline-type {
          display: inline-flex;
          align-items:center;
          justify-content:center;
          border-radius: 999px;
          padding: 6px 10px;
          font-weight: 900;
          border: 1px solid rgba(255,255,255,.12);
          min-width: 58px;
          font-size: 12px;
        }
        .discipline-pill.active { color:#9fffc7; background: rgba(24,180,95,.14); border-color: rgba(82,255,160,.35); }
        .discipline-pill.reset { color:#bdd1ea; background: rgba(120,140,170,.12); }
        .discipline-type.caution { color:#ffe58f; background: rgba(255,185,60,.14); border-color: rgba(255,214,102,.35); }
        .discipline-type.warning { color:#ffb3b3; background: rgba(255,76,76,.14); border-color: rgba(255,120,120,.35); }
        .discipline-actions { display:grid; gap:8px; }
        .discipline-actions .admin-button { width: 100%; min-height: 36px; padding: 8px 10px; border-radius: 12px; white-space: nowrap; }
        .discipline-table-card .admin-section-head { align-items:center; gap:16px; }
        @media (max-width: 1180px) {
          .discipline-page { width: min(100%, calc(100vw - 32px)); }
          .discipline-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 860px) {
          .discipline-page { width: min(100%, calc(100vw - 20px)); }
          .discipline-form-grid { grid-template-columns: 1fr; }
          .discipline-summary-grid { grid-template-columns: 1fr; }
          .discipline-rule-card, .discipline-form-card, .discipline-table-card { padding: 18px; }
        }
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
