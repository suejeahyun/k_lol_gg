"use client";

import { useState } from "react";

type Props = {
  initialEnabled: boolean;
  initialIdleHours: number;
};

export default function AdminRecruitAutoResetSettings({ initialEnabled, initialIdleHours }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [idleHours, setIdleHours] = useState(String(initialIdleHours));
  const [pending, setPending] = useState(false);

  async function handleSave() {
    if (pending) return;

    const parsedHours = Number(idleHours);
    if (!Number.isInteger(parsedHours) || parsedHours < 1 || parsedHours > 72) {
      window.alert("활동 없음 기준 시간은 1~72시간 사이의 정수로 입력해주세요.");
      return;
    }

    setPending(true);

    try {
      const res = await fetch("/api/admin/recruits/auto-reset-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, idleHours: parsedHours }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "자동 초기화 설정 저장에 실패했습니다.");
      }

      window.alert(data.message || "자동 초기화 설정을 저장했습니다.");
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "자동 초기화 설정 저장 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-inline-setting" role="group" aria-label="자동 모집번호 초기화 설정">
      <label className="admin-inline-setting__check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>활동 없음 자동 번호 초기화</span>
      </label>
      <input aria-label="자동 번호 초기화 대기 시간"
        className="admin-input admin-inline-setting__number"
        type="number"
        min="1"
        max="72"
        value={idleHours}
        onChange={(event) => setIdleHours(event.target.value)}
      />
      <span className="admin-muted">시간 후</span>
      <button className="chip-button" type="button" onClick={handleSave} disabled={pending}>
        {pending ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}
