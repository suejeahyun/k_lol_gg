"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type DetailRecord = {
  id: number;
  userAccountId: number | null;
  playerId: number | null;
  targetName: string;
  targetNickname: string | null;
  targetTag: string | null;
  type: string;
  source: string;
  reason: string;
  note: string | null;
  sourceRefType: string | null;
  sourceRefId: string | null;
  sourceRefKey: string | null;
  discordAdminNotifiedAt: string | null;
  discordDmStatus: string | null;
  discordDmSentAt: string | null;
  discordDmError: string | null;
  isActive: boolean;
  resetAt: string | null;
  resetReason: string | null;
  resetBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  userAccount?: { id: number; userId: string; role: string; status: string } | null;
  player?: { id: number; name: string; nickname: string; tag: string } | null;
};

const sourceOptions = [
  ["MANUAL", "운영자 수동"],
  ["LATE", "구인/내전 지각"],
  ["NO_SHOW", "노쇼"],
  ["CHAT_ABUSE", "전챗/감정표현"],
  ["TOXICITY", "욕설/남탓/훈수"],
  ["LINE_FORM", "라인 기재 문제"],
  ["OTHER", "기타"],
];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function recordTargetLabel(record: DetailRecord) {
  const name = record.player?.name || record.targetName;
  const nickname = record.player?.nickname || record.targetNickname;
  const tag = record.player?.tag || record.targetTag;
  const sub = nickname ? `${nickname}${tag ? `#${tag}` : ""}` : record.userAccount?.userId || "사이트 미등록";
  return { name, sub };
}

export default function DisciplineRecordDetailClient({ record }: { record: DetailRecord }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [type, setType] = useState(record.type);
  const [source, setSource] = useState(record.source);
  const [reason, setReason] = useState(record.reason);
  const [note, setNote] = useState(record.note || "");
  const [isActive, setIsActive] = useState(record.isActive);
  const target = recordTargetLabel(record);

  async function save() {
    if (!reason.trim()) {
      alert("사유를 입력해주세요.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/admin/discipline-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, source, reason, note, isActive }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "저장 실패");
      alert("저장되었습니다.");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setPending(false);
    }
  }

  async function deleteRecord() {
    if (!window.confirm(`#${record.id} 기록을 삭제 처리하겠습니까? 활성 주의/경고 카운트에서 제외됩니다.`)) return;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/discipline-records/${record.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "삭제 실패");
      router.push("/admin/discipline");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "삭제 실패");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="admin-page discipline-page">
      <div className="admin-page__header" style={{ marginBottom: 24 }}>
        <div>
          <p className="page-eyebrow">DISCIPLINE DETAIL</p>
          <h1>주의/경고 상세 #{record.id}</h1>
          <p className="admin-muted" style={{ marginTop: 8 }}>상세에서 사유, 메모, 종류, 활성 상태를 수정합니다.</p>
        </div>
        <Link className="admin-button admin-button--ghost" href="/admin/discipline">목록</Link>
      </div>

      <section className="admin-card discipline-form-card" style={{ marginBottom: 16 }}>
        <h2>대상 정보</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <Summary label="대상" value={target.name} />
          <Summary label="닉네임/계정" value={target.sub} />
          <Summary label="상태" value={isActive ? "활성" : "삭제/초기화"} />
          <Summary label="작성일" value={formatDate(record.createdAt)} />
          <Summary label="작성자" value={record.createdBy || "-"} />
          <Summary label="수정일" value={formatDate(record.updatedAt)} />
        </div>
      </section>

      <section className="admin-card discipline-form-card" style={{ marginBottom: 16 }}>
        <h2>수정</h2>
        <div className="discipline-form-grid">
          <label>상태<select value={isActive ? "ACTIVE" : "RESET"} onChange={(e) => setIsActive(e.target.value === "ACTIVE")}><option value="ACTIVE">활성</option><option value="RESET">삭제/초기화</option></select></label>
          <label>종류<select value={type} onChange={(e) => setType(e.target.value)}><option value="CAUTION">주의</option><option value="WARNING">경고</option></select></label>
          <label>사유 유형<select value={source} onChange={(e) => setSource(e.target.value)}>{sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="discipline-wide">사유<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <label className="discipline-wide">관리자 메모<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="운영진 내부 참고 메모" /></label>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button className="admin-button" type="button" disabled={pending} onClick={() => void save()}>저장</button>
          <button className="admin-button admin-button--danger" type="button" disabled={pending} onClick={() => void deleteRecord()}>삭제</button>
        </div>
      </section>

      <section className="admin-card discipline-form-card">
        <h2>시스템 정보</h2>
        <div style={{ display: "grid", gap: 10, lineHeight: 1.7 }}>
          <div><strong>초기화:</strong> {record.resetAt ? `${formatDate(record.resetAt)} · ${record.resetBy || "-"}` : "-"}</div>
          <div><strong>초기화 사유:</strong> {record.resetReason || "-"}</div>
          <div><strong>출처:</strong> {record.sourceRefType || "-"} {record.sourceRefId ? `#${record.sourceRefId}` : ""}</div>
          <div><strong>DM 상태:</strong> {record.discordDmStatus || "-"} {record.discordDmSentAt ? `· ${formatDate(record.discordDmSentAt)}` : ""}</div>
          {record.discordDmError ? <div><strong>DM 오류:</strong> {record.discordDmError}</div> : null}
        </div>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid rgba(148, 163, 184, 0.16)", borderRadius: 14, padding: 14, background: "rgba(2, 6, 23, 0.28)", minWidth: 0 }}>
      <div className="admin-muted" style={{ fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={value}>{value}</div>
    </div>
  );
}
