"use client";

import { useEffect, useState } from "react";

type HealthPayload = {
  healthy?: boolean;
  checkedAt?: string;
  counts?: {
    activeParties?: number;
    duplicateActivePartyNumbers?: number;
    malformedSubstitutes?: number;
    staleScrims?: number;
  };
  dailyClose?: {
    ageHours?: number | null;
    healthy?: boolean;
  };
  message?: string;
};

export default function KakaoRecruitHealthPanel({ canRepair }: { canRepair: boolean }) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadHealth() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/kakao/recruit-health", {
        cache: "no-store",
      });
      const data = (await response.json()) as HealthPayload;
      setHealth(data);
      if (!response.ok) setMessage(data.message || "진단 정보를 불러오지 못했습니다.");
    } catch {
      setMessage("진단 서버에 연결하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function repairSafeData() {
    if (!window.confirm("잘못된 예비 이름과 오래된 스크림만 안전 정리할까요?")) return;

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/kakao/recruit-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as { health?: HealthPayload; message?: string };
      if (!response.ok) {
        setMessage(data.message || "안전 복구에 실패했습니다.");
        return;
      }
      setHealth(data.health ?? null);
      setMessage("안전 복구가 완료되었습니다.");
    } catch {
      setMessage("복구 서버에 연결하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  return (
    <section className="admin-card" style={{ marginTop: 20 }}>
      <div className="admin-section-head">
        <div>
          <h2>구인 데이터 안전 진단</h2>
          <p className="admin-muted">
            중복 활성 번호, 잘못 저장된 예비 이름, 오래된 스크림과 오전 6시 작업 상태를 확인합니다.
          </p>
        </div>
      </div>

      {loading ? <p className="admin-muted">확인 중...</p> : null}
      {health ? (
        <div className="card-grid">
          <div className="admin-card">
            <strong>{health.healthy ? "정상" : "확인 필요"}</strong>
            <p className="admin-muted">전체 상태</p>
          </div>
          <div className="admin-card">
            <strong>{health.counts?.duplicateActivePartyNumbers ?? 0}</strong>
            <p className="admin-muted">중복 활성 파티 번호</p>
          </div>
          <div className="admin-card">
            <strong>{health.counts?.malformedSubstitutes ?? 0}</strong>
            <p className="admin-muted">잘못된 예비 이름</p>
          </div>
          <div className="admin-card">
            <strong>{health.counts?.staleScrims ?? 0}</strong>
            <p className="admin-muted">종료되지 않은 과거 스크림</p>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <button className="admin-button admin-button--ghost" type="button" onClick={() => void loadHealth()} disabled={loading}>
          다시 확인
        </button>
        {canRepair ? (
          <button className="admin-button" type="button" onClick={() => void repairSafeData()} disabled={loading}>
            안전 복구
          </button>
        ) : null}
      </div>
      {message ? <p className="admin-muted" style={{ marginTop: 12 }}>{message}</p> : null}
    </section>
  );
}
