"use client";

import { useCallback, useEffect, useState } from "react";

type UserStatus = "PENDING" | "APPROVED" | "REJECTED";
type UserRole = "USER" | "ADMIN";

type AdminUser = {
  id: number;
  userId: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  player: {
    id: number;
    nickname: string;
    tag: string;
    peakTier: string | null;
    currentTier: string | null;
  } | null;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

const fetchUsers = useCallback(async () => {
  try {
    setLoading(true);

    const res = await fetch("/api/admin/users", {
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "회원 목록 조회 실패");
      return;
    }

    setUsers(data.users);
  } catch (error) {
    console.error("[ADMIN_USERS_FETCH_ERROR]", error);
    alert("회원 목록을 불러오는 중 오류가 발생했습니다.");
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => {
  fetchUsers();
}, [fetchUsers]);

  const handleApprove = async (userAccountId: number) => {
    const res = await fetch(`/api/admin/users/${userAccountId}/approve`, {
      method: "PATCH",
    });

    if (res.ok) {
      fetchUsers();
    } else {
      const data = await res.json();
      alert(data.message || "승인 처리 실패");
    }
  };

  const handleReject = async (userAccountId: number) => {
    const res = await fetch(`/api/admin/users/${userAccountId}/reject`, {
      method: "PATCH",
    });

    if (res.ok) {
      fetchUsers();
    } else {
      const data = await res.json();
      alert(data.message || "거절 처리 실패");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">회원 승인 관리</h1>
          <p className="admin-page__description">
            회원가입 신청자를 승인하거나 거절합니다.
          </p>
        </div>
      </div>

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-empty">회원 목록을 불러오는 중입니다.</div>
        ) : users.length === 0 ? (
          <div className="admin-empty">회원가입 신청자가 없습니다.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>아이디</th>
                <th>닉네임</th>
                <th>태그</th>
                <th>최고티어</th>
                <th>현재티어</th>
                <th>상태</th>
                <th>가입일</th>
                <th>관리</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.userId}</td>
                  <td>{user.player?.nickname ?? "-"}</td>
                  <td>{user.player?.tag ?? "-"}</td>
                  <td>{user.player?.peakTier ?? "-"}</td>
                  <td>{user.player?.currentTier ?? "-"}</td>
                  <td>{getStatusLabel(user.status)}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString("ko-KR")}</td>
                  <td>
                    {user.status === "PENDING" ? (
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="chip-button"
                          onClick={() => handleApprove(user.id)}
                        >
                          승인
                        </button>

                        <button
                          type="button"
                          className="chip-button chip-button--danger"
                          onClick={() => handleReject(user.id)}
                        >
                          거절
                        </button>
                      </div>
                    ) : (
                      <span className="admin-muted">처리 완료</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function getStatusLabel(status: UserStatus) {
  if (status === "PENDING") return "승인 대기";
  if (status === "APPROVED") return "승인 완료";
  if (status === "REJECTED") return "거절됨";
  return status;
}