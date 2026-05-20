"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Pagination from "@/components/Pagination";

type UserStatus = "PENDING" | "APPROVED" | "REJECTED";
type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";

type AdminUser = {
  id: number;
  userId: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  player: {
    id: number;
    name?: string;
    nickname: string;
    tag: string;
    peakTier: string | null;
    currentTier: string | null;
  } | null;
  linkStatus: "PLAYER_LINKED" | "NO_PLAYER";
};

type CurrentAdmin = {
  id: number | null;
  userId: string;
  role: UserRole;
};

type PaginationState = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type AdminUsersResponse = {
  currentAdmin: CurrentAdmin;
  users: AdminUser[];
  pagination: PaginationState;
};

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<CurrentAdmin | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("PENDING");

  const isSuperAdmin = currentAdmin?.role === "SUPER_ADMIN";

  const fetchUsers = useCallback(
    async (targetPage: number) => {
      try {
        setLoading(true);

        const params = new URLSearchParams();
        params.set("page", String(targetPage));
        params.set("pageSize", String(PAGE_SIZE));

        if (q.trim()) {
          params.set("q", q.trim());
        }

        if (status) {
          params.set("status", status);
        }

        const res = await fetch(`/api/admin/users?${params.toString()}`, {
          cache: "no-store",
        });

        const data = (await res.json()) as AdminUsersResponse & {
          message?: string;
        };

        if (!res.ok) {
          alert(data.message || "회원 목록 조회 실패");
          return;
        }

        setCurrentAdmin(data.currentAdmin);
        setUsers(data.users);
        setPagination(data.pagination);
      } catch (error) {
        console.error("[ADMIN_USERS_FETCH_ERROR]", error);
        alert("회원 목록을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [q, status],
  );

  useEffect(() => {
    void fetchUsers(1);
  }, [fetchUsers]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQ(searchText.trim());
  };

  const handlePageChange = (page: number) => {
    void fetchUsers(page);
  };

  const handleApprove = async (userAccountId: number) => {
    const res = await fetch(`/api/admin/users/${userAccountId}/approve`, {
      method: "PATCH",
    });

    if (res.ok) {
      void fetchUsers(pagination.page);
    } else {
      const data = await res.json();
      alert(data.message || "승인 처리 실패");
    }
  };

  const handleReject = async (userAccountId: number) => {
    const reason = window.prompt("거절 사유를 입력하세요. 비워두면 사유 없이 처리됩니다.") ?? "";
    const res = await fetch(`/api/admin/users/${userAccountId}/reject`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    if (res.ok) {
      void fetchUsers(pagination.page);
    } else {
      const data = await res.json();
      alert(data.message || "거절 처리 실패");
    }
  };

  const handleReset = async (userAccountId: number) => {
    const ok = window.confirm("해당 회원 상태를 승인 대기로 되돌리겠습니까?");
    if (!ok) return;

    const res = await fetch(`/api/admin/users/${userAccountId}/reset`, {
      method: "PATCH",
    });

    if (res.ok) {
      void fetchUsers(pagination.page);
    } else {
      const data = await res.json();
      alert(data.message || "상태 초기화 실패");
    }
  };

  const handleRoleChange = async (user: AdminUser, nextRole: "USER" | "ADMIN") => {
    const message =
      nextRole === "ADMIN"
        ? `${user.userId} 계정을 관리자로 지정하겠습니까?`
        : `${user.userId} 계정의 관리자 권한을 해제하겠습니까?`;

    const ok = window.confirm(message);
    if (!ok) return;

    const res = await fetch(`/api/admin/users/${user.id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });

    const data = await res.json();

    if (res.ok) {
      alert(data.message || "권한이 변경되었습니다.");
      void fetchUsers(pagination.page);
    } else {
      alert(data.message || "권한 변경 실패");
    }
  };

  const handlePasswordReset = async (user: AdminUser) => {
    const ok = window.confirm(`${user.userId} 계정의 비밀번호를 임시 비밀번호로 초기화하겠습니까?`);
    if (!ok) return;

    const res = await fetch(`/api/admin/users/${user.id}/password-reset`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json();

    if (res.ok) {
      window.alert(`임시 비밀번호: ${data.tempPassword}\n해당 유저에게 전달 후 로그인 뒤 비밀번호 변경을 안내하세요.`);
    } else {
      alert(data.message || "비밀번호 초기화 실패");
    }
  };

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">플레이어 승인 관리</h1>
          <p className="admin-page__description">
            플레이어 계정 승인, 관리자 지정, 비밀번호 초기화를 관리합니다.
          </p>
        </div>
      </div>

      <form className="admin-filter-bar" onSubmit={handleSearch}>
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="아이디, 이름, 닉네임, 태그 검색"
          className="admin-input"
        />

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as UserStatus | "")}
          className="admin-input"
        >
          <option value="">전체 상태</option>
          <option value="PENDING">승인 대기</option>
          <option value="APPROVED">승인 완료</option>
          <option value="REJECTED">거절됨</option>
        </select>

        <button className="admin-button" type="submit">
          검색
        </button>
      </form>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>회원 목록</h2>
            <p className="admin-muted">
              총 {pagination.totalCount.toLocaleString("ko-KR")}명 · 현재{" "}
              {pagination.page} / {pagination.totalPages}페이지
              {currentAdmin ? ` · 현재 권한: ${getRoleLabel(currentAdmin.role)}` : ""}
            </p>
          </div>
        </div>

        <div className="admin-table-wrap">
          {loading ? (
            <div className="admin-empty">회원 목록을 불러오는 중입니다.</div>
          ) : users.length === 0 ? (
            <div className="admin-empty">조건에 맞는 회원이 없습니다.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>아이디</th>
                  <th>이름</th>
                  <th>닉네임</th>
                  <th>태그</th>
                  <th>최고티어</th>
                  <th>현재티어</th>
                  <th>상태</th>
                  <th>권한</th>
                  <th>연결</th>
                  <th>가입일</th>
                  <th>관리</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.userId}</td>
                    <td>{user.player?.name ?? "-"}</td>
                    <td>{user.player?.nickname ?? "-"}</td>
                    <td>{user.player?.tag ?? "-"}</td>
                    <td>{user.player?.peakTier ?? "-"}</td>
                    <td>{user.player?.currentTier ?? "-"}</td>
                    <td>{getStatusLabel(user.status)}</td>
                    <td>{getRoleLabel(user.role)}</td>
                    <td>{getLinkStatusLabel(user.linkStatus)}</td>
                    <td>
                      {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td>
                      <div className="admin-actions">
                        {user.status === "PENDING" ? (
                          <>
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
                          </>
                        ) : (
                          <button
                            type="button"
                            className="chip-button"
                            onClick={() => handleReset(user.id)}
                          >
                            대기 전환
                          </button>
                        )}

                        {isSuperAdmin && user.role !== "SUPER_ADMIN" ? (
                          <>
                            {user.role === "ADMIN" ? (
                              <button
                                type="button"
                                className="chip-button chip-button--danger"
                                onClick={() => handleRoleChange(user, "USER")}
                              >
                                관리자 해제
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="chip-button"
                                onClick={() => handleRoleChange(user, "ADMIN")}
                                disabled={user.status !== "APPROVED"}
                                title={user.status !== "APPROVED" ? "승인 완료 후 관리자 지정 가능" : undefined}
                              >
                                관리자 지정
                              </button>
                            )}

                            <button
                              type="button"
                              className="chip-button"
                              onClick={() => handlePasswordReset(user)}
                            >
                              비번 초기화
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={handlePageChange}
        />
      </section>
    </main>
  );
}

function getStatusLabel(status: UserStatus) {
  if (status === "PENDING") return "승인 대기";
  if (status === "APPROVED") return "승인 완료";
  if (status === "REJECTED") return "거절됨";
  return status;
}

function getRoleLabel(role: UserRole) {
  if (role === "SUPER_ADMIN") return "최고 관리자";
  if (role === "ADMIN") return "관리자";
  return "일반 유저";
}

function getLinkStatusLabel(status: AdminUser["linkStatus"]) {
  if (status === "PLAYER_LINKED") return "Player 연결됨";
  return "Player 없음";
}
