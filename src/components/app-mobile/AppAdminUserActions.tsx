"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type UserStatus = "PENDING" | "APPROVED" | "REJECTED" | string;

export function AppAdminUserActions({
  userAccountId,
  status,
  canApprove,
}: {
  userAccountId: number;
  status: UserStatus;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function runAction(action: "approve" | "reject" | "reset") {
    setLoadingAction(action);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/users/${userAccountId}/${action}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "reject" ? JSON.stringify({ reason: "앱 관리자 페이지 처리" }) : undefined,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || "처리 실패");
      }

      setMessage(data?.message || "처리 완료");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리 실패");
    } finally {
      setLoadingAction(null);
    }
  }

  const disabled = Boolean(loadingAction);

  return (
    <div className="klol-app-user-actions">
      {status !== "APPROVED" ? (
        <button
          className="klol-app-mini-button klol-app-mini-button--primary"
          type="button"
          disabled={disabled || !canApprove}
          onClick={() => runAction("approve")}
          title={canApprove ? "회원 승인" : "플레이어 연결 후 승인 가능"}
        >
          {loadingAction === "approve" ? "승인중" : "승인"}
        </button>
      ) : null}

      {status !== "REJECTED" ? (
        <button
          className="klol-app-mini-button"
          type="button"
          disabled={disabled}
          onClick={() => runAction("reject")}
        >
          {loadingAction === "reject" ? "거절중" : "거절"}
        </button>
      ) : null}

      {status !== "PENDING" ? (
        <button
          className="klol-app-mini-button"
          type="button"
          disabled={disabled}
          onClick={() => runAction("reset")}
        >
          {loadingAction === "reset" ? "대기중" : "대기"}
        </button>
      ) : null}

      {message ? <p className="klol-app-action-message">{message}</p> : null}
      {!canApprove && status !== "APPROVED" ? (
        <p className="klol-app-action-message klol-app-action-message--warn">플레이어 미연결</p>
      ) : null}
    </div>
  );
}
