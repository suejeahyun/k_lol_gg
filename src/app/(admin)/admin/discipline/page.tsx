export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import DisciplineRecordListClient from "@/components/admin/DisciplineRecordListClient";

export default async function AdminDisciplinePage() {
  const [records, activeWarnings, activeCautions] = await Promise.all([
    prisma.userDisciplineRecord.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        userAccount: { select: { id: true, userId: true, role: true, status: true } },
        player: { select: { id: true, name: true, nickname: true, tag: true } },
      },
    }),
    prisma.userDisciplineRecord.count({ where: { isActive: true, type: "WARNING" } }),
    prisma.userDisciplineRecord.count({ where: { isActive: true, type: "CAUTION" } }),
  ]);

  const initialRecords = records.map((record) => ({
    ...record,
    createdAt: record.createdAt.toISOString(),
    resetAt: record.resetAt ? record.resetAt.toISOString() : null,
  }));

  return (
    <main className="admin-page discipline-page">
      <DisciplineStyles />
      <div className="admin-page__header" style={{ marginBottom: 24 }}>
        <div>
          <p className="page-eyebrow">DISCIPLINE</p>
          <h1>운영 경고 관리</h1>
          <p className="admin-muted" style={{ marginTop: 8 }}>주의/경고는 목록에서 간단히 확인하고, 상세에서 수정·삭제합니다.</p>
        </div>
      </div>
      <div className="discipline-page-shell">
        <section className="discipline-summary-grid">
          <div className="discipline-stat"><span>활성 주의</span><strong>{activeCautions}회</strong></div>
          <div className="discipline-stat"><span>활성 경고</span><strong>{activeWarnings}회</strong></div>
          <div className="discipline-stat"><span>전체 기록</span><strong>{records.length}건</strong></div>
        </section>
        <DisciplineRecordListClient initialRecords={initialRecords} />
      </div>
    </main>
  );
}

function DisciplineStyles() {
  return <style>{`
    .discipline-page { width: min(1500px, calc(100vw - 56px)); margin: 0 auto; padding-bottom: 64px; }
    .discipline-page-shell { display: grid; gap: 22px; }
    .discipline-table-card, .discipline-stat, .discipline-form-card {
      border: 1px solid rgba(82, 164, 255, .24);
      background: linear-gradient(180deg, rgba(10, 28, 55, .86), rgba(5, 15, 34, .76));
      border-radius: 22px;
      box-shadow: 0 18px 48px rgba(0,0,0,.24);
    }
    .discipline-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(190px, 1fr)); gap: 14px; }
    .discipline-stat { padding: 20px 22px; min-height: 106px; display: grid; align-content: center; }
    .discipline-stat span { color: rgba(190,218,255,.75); display:block; margin-bottom: 8px; font-size: 13px; }
    .discipline-stat strong { font-size: 32px; line-height: 1; letter-spacing: -.03em; }
    .discipline-table-card, .discipline-form-card { padding: 24px; }
    .discipline-help { margin: -4px 0 14px; line-height: 1.55; }
    .discipline-table-wrap { overflow-x: auto; border-radius: 18px; }
    .discipline-table--simple { min-width: 900px; table-layout: fixed; }
    .discipline-table--simple th:nth-child(1), .discipline-table--simple td:nth-child(1) { width: 130px; }
    .discipline-table--simple th:nth-child(2), .discipline-table--simple td:nth-child(2) { width: auto; }
    .discipline-table--simple th:nth-child(3), .discipline-table--simple td:nth-child(3) { width: 140px; }
    .discipline-table--simple th:nth-child(4), .discipline-table--simple td:nth-child(4) { width: 190px; }
    .discipline-table--simple th:nth-child(5), .discipline-table--simple td:nth-child(5) { width: 190px; }
    .discipline-target-main { display:flex; align-items:center; gap:8px; min-width: 0; }
    .discipline-target-main strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .discipline-direct-badge { display:inline-flex; padding:4px 8px; border-radius:999px; border:1px solid rgba(255,216,112,.35); background:rgba(255,196,64,.12); color:#ffe39d; font-size:12px; font-weight:900; vertical-align:middle; flex: 0 0 auto; }
    .discipline-pill, .discipline-type { display: inline-flex; align-items:center; justify-content:center; border-radius: 999px; padding: 6px 10px; font-weight: 900; border: 1px solid rgba(255,255,255,.12); min-width: 58px; font-size: 12px; }
    .discipline-pill.active { color:#9fffc7; background: rgba(24,180,95,.14); border-color: rgba(82,255,160,.35); }
    .discipline-pill.reset { color:#bdd1ea; background: rgba(120,140,170,.12); }
    .discipline-type.caution { color:#ffe58f; background: rgba(255,185,60,.14); border-color: rgba(255,214,102,.35); }
    .discipline-type.warning { color:#ffb3b3; background: rgba(255,76,76,.14); border-color: rgba(255,120,120,.35); }
    .discipline-actions { display:flex; gap:8px; flex-wrap:wrap; }
    .discipline-actions .admin-button { min-height: 36px; padding: 8px 10px; border-radius: 12px; white-space: nowrap; }
    @media (max-width: 860px) { .discipline-page { width: min(100%, calc(100vw - 20px)); } .discipline-summary-grid { grid-template-columns: 1fr; } .discipline-table-card, .discipline-form-card { padding: 18px; } }
  `}</style>;
}
