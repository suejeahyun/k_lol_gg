"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Pagination from "@/components/Pagination";

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
    name?: string;
    nickname: string;
    tag: string;
    peakTier: string | null;
    currentTier: string | null;
  } | null;
};

type PaginationState = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type AdminUsersResponse = {
  users: AdminUser[];
  pagination: PaginationState;
};

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
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
    // 최초 진입 및 적용된 필터 변경 시 1페이지부터 조회합니다.
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
    const res = await fetch(`/api/admin/users/${userAccountId}/reject`, {
      method: "PATCH",
    });

    if (res.ok) {
      void fetchUsers(pagination.page);
    } else {
      const data = await res.json();
      alert(data.message || "거절 처리 실패");
    }
  };

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">회원 승인 관리</h1>
          <p className="admin-page__description">
            회원가입 신청자를 승인하거나 거절합니다.
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
                    <td>
                      {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                    </td>
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
