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
  createdAt: string;`r`n  adminTotpEnabled: boolean;`r`n  adminTotpEnabledAt: string | null;`r`n  adminTotpSetupPending: boolean;`r`n  player: {
    id: number;
    name?: string;
    nickname: string;
    tag: string;
    peakTier: string | null;
    currentTier: string | null;
  } | null;
  linkStatus: "PLAYER_LINKED" | "NO_PLAYER";
  discord?: {
    id: string | null;
    username: string | null;
    globalName: string | null;
    serverNickname: string | null;
    parsedBirthYear: string | null;
    parsedName: string | null;
    parsedNickname: string | null;
    parsedTier: string | null;
    linkStatus: string | null;
    linkedAt: string | null;
  };
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

const compactCellStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 24,
  borderRadius: 999,
  padding: "0 10px",
  border: "1px solid rgba(125, 211, 252, 0.28)",
  background: "rgba(14, 165, 233, 0.12)",
  color: "#dff7ff",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  whiteSpace: "nowrap",
} as const;

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


  const handleTwoFactorReset = async (user: AdminUser) => {
    const ok = window.confirm(`${user.userId} 계정의 2단계 인증을 초기화하겠습니까?\n해당 관리자는 다음 로그인 후 인증앱을 다시 등록해야 합니다.`);
    if (!ok) return;

    const res = await fetch(`/api/admin/users/${user.id}/2fa-reset`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      alert(data.message || "2단계 인증이 초기화되었습니다.");
      void fetchUsers(pagination.page);
    } else {
      alert(data.message || "2단계 인증 초기화 실패");
    }
  };
  return (
    <main className="admin-page" style={{ width: "min(1180px, calc(100vw - 48px))", maxWidth: 1180 }}>
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">플레이어 승인 관리</h1>
          <p className="admin-page__description">
            플레이어 계정 승인, 관리자, 비밀번호 초기화를 관리합니다.
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
              총 {pagination.totalCount.toLocaleString("ko-KR")}명 · 현재 {" "}
              {pagination.page} / {pagination.totalPages}페이지
              {currentAdmin ? ` · 현재 권한: ${getRoleLabel(currentAdmin.role)}` : ""}
            </p>
          </div>
        </div>

        <div
          className="admin-table-wrap admin-users-compact-wrap"
          style={{ overflowX: "hidden", maxWidth: "100%" }}
        >
          {loading ? (
            <div className="admin-empty">회원 목록을 불러오는 중입니다.</div>
          ) : users.length === 0 ? (
            <div className="admin-empty">조건에 맞는 회원이 없습니다.</div>
          ) : (
            <table
              className="admin-table admin-users-compact-table"
              style={{ width: "100%", tableLayout: "fixed", fontSize: 12 }}
            >
              <colgroup>
                <col style={{ width: "9%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "11%" }} />`r`n                <col style={{ width: "7%" }} />`r`n                <col style={{ width: "7%" }} />`r`n                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>아이디</th>
                  <th>이름</th>
                  <th>닉네임 #태그</th>
                  <th>최고티어</th>
                  <th>현재티어</th>
                  <th>상태</th>
                  <th>권한</th>
                  <th>연결</th>
                  <th>가입</th>`r`n                  <th>2FA</th>`r`n                  <th>관리</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => {
                  const riotName = formatRiotName(user.player?.nickname, user.player?.tag);

                  return (
                    <tr key={user.id}>
                      <td title={user.userId} style={compactCellStyle}>{maskUserId(user.userId)}</td>
                      <td title={user.player?.name ?? "-"} style={compactCellStyle}>{user.player?.name ?? "-"}</td>
                      <td title={riotName} style={compactCellStyle}>{riotName}</td>
                      <td title={formatTier(user.player?.peakTier)} style={compactCellStyle}>{formatTier(user.player?.peakTier)}</td>
                      <td title={formatTier(user.player?.currentTier)} style={compactCellStyle}>{formatTier(user.player?.currentTier)}</td>
                      <td><StatusBadge status={user.status} /></td>
                      <td><span style={badgeStyle}>{getRoleLabel(user.role)}</span></td>
                      <td title={getConnectionLabel(user)} style={compactCellStyle}>{getConnectionLabel(user)}</td>
                      <td style={compactCellStyle}>{formatDate(user.createdAt)}</td>`r`n                      <td><TwoFactorBadge user={user} /></td>`r`n                      <td>
                        <div
                          className="admin-actions"
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 4,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
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
                              대기
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
                                  일반
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="chip-button"
                                  onClick={() => handleRoleChange(user, "ADMIN")}
                                  disabled={user.status !== "APPROVED"}
                                  title={user.status !== "APPROVED" ? "승인 완료 후 관리자 가능" : undefined}
                                >
                                  관리자
                                </button>
                              )}

                              <button`r`n                                type="button"`r`n                                className="chip-button"`r`n                                onClick={() => handlePasswordReset(user)}`r`n                              >`r`n                                비번`r`n                              </button>`r`n`r`n                              {(user.adminTotpEnabled || user.adminTotpSetupPending) ? (`r`n                                <button`r`n                                  type="button"`r`n                                  className="chip-button chip-button--danger"`r`n                                  onClick={() => handleTwoFactorReset(user)}`r`n                                >`r`n                                  2FA초기화`r`n                                </button>`r`n                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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


function TwoFactorBadge({ user }: { user: AdminUser }) {
  const label = user.adminTotpEnabled ? "활성" : user.adminTotpSetupPending ? "설정중" : "미사용";
  const borderColor = user.adminTotpEnabled
    ? "rgba(45, 212, 191, 0.36)"
    : user.adminTotpSetupPending
      ? "rgba(250, 204, 21, 0.36)"
      : "rgba(148, 163, 184, 0.25)";
  const background = user.adminTotpEnabled
    ? "rgba(20, 184, 166, 0.13)"
    : user.adminTotpSetupPending
      ? "rgba(234, 179, 8, 0.12)"
      : "rgba(15, 23, 42, 0.45)";

  return (
    <span
      title={user.adminTotpEnabledAt ? `등록일: ${formatDate(user.adminTotpEnabledAt)}` : undefined}
      style={{
        ...badgeStyle,
        borderColor,
        background,
      }}
    >
      {label}
    </span>
  );
}
function StatusBadge({ status }: { status: UserStatus }) {
  const label = getStatusLabel(status);
  const danger = status === "REJECTED";
  const pending = status === "PENDING";

  return (
    <span
      style={{
        ...badgeStyle,
        borderColor: danger
          ? "rgba(248, 113, 113, 0.36)"
          : pending
            ? "rgba(250, 204, 21, 0.36)"
            : "rgba(45, 212, 191, 0.34)",
        background: danger
          ? "rgba(239, 68, 68, 0.14)"
          : pending
            ? "rgba(234, 179, 8, 0.12)"
            : "rgba(20, 184, 166, 0.13)",
      }}
    >
      {label}
    </span>
  );
}

function maskUserId(userId: string) {
  const value = String(userId ?? "").trim();
  if (!value) return "-";
  if (value.length <= 3) return value;
  return `${value.slice(0, 3)}***`;
}

function formatRiotName(nickname?: string | null, tag?: string | null) {
  const nick = String(nickname ?? "").trim();
  const riotTag = String(tag ?? "").trim();
  if (!nick && !riotTag) return "-";
  if (!riotTag) return nick || "-";
  if (!nick) return `#${riotTag}`;
  return `${nick} #${riotTag}`;
}

function formatTier(tier?: string | null) {
  const value = String(tier ?? "").trim();
  return value || "-";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function getStatusLabel(status: UserStatus) {
  if (status === "PENDING") return "대기";
  if (status === "APPROVED") return "승인";
  if (status === "REJECTED") return "거절";
  return status;
}

function getRoleLabel(role: UserRole) {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "관리자";
  return "일반";
}

function getConnectionLabel(user: AdminUser) {
  const playerLinked = user.linkStatus === "PLAYER_LINKED" && Boolean(user.player);
  const discordLinked = Boolean(user.discord?.id);

  if (playerLinked && discordLinked) return "모두 연동";

  const missing: string[] = [];
  if (!playerLinked) missing.push("Player 미연동");
  if (!discordLinked) missing.push("Discord 미연동");

  return missing.join(" / ") || "-";
}

