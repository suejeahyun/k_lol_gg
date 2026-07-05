export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import DisciplineRecordDetailClient from "@/components/admin/DisciplineRecordDetailClient";

export default async function AdminDisciplineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) notFound();

  const record = await prisma.userDisciplineRecord.findUnique({
    where: { id: recordId },
    include: {
      userAccount: { select: { id: true, userId: true, role: true, status: true } },
      player: { select: { id: true, name: true, nickname: true, tag: true } },
    },
  });

  if (!record) notFound();

  const serialized = {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    resetAt: record.resetAt ? record.resetAt.toISOString() : null,
  };

  return (
    <>
      <DisciplineDetailStyles />
      <DisciplineRecordDetailClient record={serialized} />
    </>
  );
}

function DisciplineDetailStyles() {
  return <style>{`
    .discipline-page { width: min(1120px, calc(100vw - 56px)); margin: 0 auto; padding-bottom: 64px; }
    .discipline-form-card { border: 1px solid rgba(82, 164, 255, .24); background: linear-gradient(180deg, rgba(10, 28, 55, .86), rgba(5, 15, 34, .76)); border-radius: 22px; box-shadow: 0 18px 48px rgba(0,0,0,.24); padding: 24px; }
    .discipline-form-card h2 { margin: 0 0 14px; letter-spacing: -.02em; }
    .discipline-form-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; margin-bottom: 18px; }
    .discipline-form-grid label { display: grid; gap: 8px; font-weight: 800; color: #bfe7ff; font-size: 13px; }
    .discipline-form-grid input, .discipline-form-grid select, .discipline-form-grid textarea { width: 100%; min-height: 44px; border-radius: 12px; border: 1px solid rgba(96,166,255,.30); background: rgba(2,10,24,.88); color: #f3fbff; padding: 11px 13px; outline: none; }
    .discipline-form-grid textarea { min-height: 112px; resize: vertical; line-height: 1.55; }
    .discipline-wide { grid-column: 1 / -1; }
    @media (max-width: 860px) { .discipline-page { width: min(100%, calc(100vw - 20px)); } .discipline-form-grid { grid-template-columns: 1fr; } .discipline-form-card { padding: 18px; } }
  `}</style>;
}
