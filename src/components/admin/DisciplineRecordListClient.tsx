"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RecordItem = {
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
  isActive: boolean;
  resetAt: string | null;
  createdAt: string;
  createdBy: string | null;
  userAccount?: { id: number; userId: string; role: string; status: string } | null;
  player?: { id: number; name: string; nickname: string; tag: string } | null;
};

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

function typeLabel(type: string) {
  if (type === "WARNING") return "경고";
  return "주의";
}

function recordTargetLabel(record: RecordItem) {
  const name = record.player?.name || record.targetName;
  const nickname = record.player?.nickname || record.targetNickname;
  const tag = record.player?.tag || record.targetTag;
  const sub = nickname ? `${nickname}${tag ? `#${tag}` : ""}` : record.userAccount?.userId || "사이트 미등록";
  return { name, sub };
}

export default function DisciplineRecordListClient({ initialRecords }: { initialRecords: RecordItem[] }) {
  const router = useRouter();
  const [records, setRecords] = useState(initialRecords);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");
  const [busyId, setBusyId] = useState<number | null>(null);

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();

    return records.filter((record) => {
      if (statusFilter === "ACTIVE" && !record.isActive) return false;
      if (statusFilter === "INACTIVE" && record.isActive) return false;

      if (!q) return true;

      const target = recordTargetLabel(record);
      const values = [target.name, target.sub, record.targetName, record.targetNickname, record.targetTag, record.player?.name, record.player?.nickname, record.player?.tag, record.userAccount?.userId];
      return values.some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [query, records, statusFilter]);

  const statusCounts = useMemo(() => {
    return records.reduce(
      (acc, record) => {
        if (record.isActive) acc.active += 1;
        else acc.inactive += 1;
        acc.all += 1;
        return acc;
      },
      { active: 0, inactive: 0, all: 0 },
    );
  }, [records]);

  async function deleteRecord(id: number) {
    if (!window.confirm(`#${id} 기록을 삭제 처리하겠습니까? 활성 주의/경고 카운트에서 제외됩니다.`)) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/admin/discipline-records/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "삭제 실패");
      setRecords((prev) => prev.map((record) => record.id === id ? { ...record, isActive: false, resetAt: new Date().toISOString() } : record));
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "삭제 실패");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-card discipline-table-card">
      <div className="admin-section-head" style={{ alignItems: "flex-end", gap: 16 }}>
        <div>
          <h2>주의/경고 목록</h2>
          <p className="admin-muted discipline-help">기본값은 활성 기록입니다. 상태 필터로 삭제/초기화 기록과 전체 기록을 나눠 확인합니다.</p>
        </div>
        <div style={{ display: "grid", justifyItems: "end", gap: 10 }}>
          <div className="discipline-status-tabs" role="tablist" aria-label="경고 상태 필터">
            <button
              className={`discipline-status-tab ${statusFilter === "ACTIVE" ? "is-active" : ""}`}
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
            >
              활성 {statusCounts.active}
            </button>
            <button
              className={`discipline-status-tab ${statusFilter === "INACTIVE" ? "is-active" : ""}`}
              type="button"
              onClick={() => setStatusFilter("INACTIVE")}
            >
              삭제/초기화 {statusCounts.inactive}
            </button>
            <button
              className={`discipline-status-tab ${statusFilter === "ALL" ? "is-active" : ""}`}
              type="button"
              onClick={() => setStatusFilter("ALL")}
            >
              전체 {statusCounts.all}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
            <input
              className="app-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="플레이어 이름 또는 닉네임 검색"
              style={{ minWidth: 260, minHeight: 42 }}
            />
            <Link className="admin-button" href="/admin/discipline/new">주의 등록</Link>
          </div>
        </div>
      </div>
      <div className="admin-table-wrap discipline-table-wrap">
        <table className="admin-table discipline-table discipline-table--simple">
          <thead><tr><th>상태</th><th>대상</th><th>종류</th><th>작성일</th><th>관리</th></tr></thead>
          <tbody>
            {filteredRecords.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 28 }}>기록이 없습니다.</td></tr> : filteredRecords.map((record) => {
              const target = recordTargetLabel(record);
              const isDirect = !record.userAccountId && !record.playerId;
              return (
                <tr key={record.id}>
                  <td><span className={`discipline-pill ${record.isActive ? "active" : "reset"}`}>{record.isActive ? "활성" : "삭제/초기화"}</span></td>
                  <td><div className="discipline-target-main"><strong title={target.name}>{target.name}</strong>{isDirect ? <span className="discipline-direct-badge">미등록</span> : null}</div><span className="admin-muted">{target.sub}</span></td>
                  <td><span className={`discipline-type ${record.type.toLowerCase()}`}>{typeLabel(record.type)}</span></td>
                  <td>{formatDate(record.createdAt)}<br /><span className="admin-muted">{record.createdBy || "-"}</span></td>
                  <td><div className="discipline-actions discipline-actions--row"><Link className="admin-button admin-button--secondary" href={`/admin/discipline/${record.id}`}>상세</Link><button className="admin-button admin-button--danger" type="button" disabled={busyId === record.id} onClick={() => void deleteRecord(record.id)}>삭제</button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
