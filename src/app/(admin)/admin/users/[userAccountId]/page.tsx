"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type UserStatus = "PENDING" | "APPROVED" | "REJECTED";
type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";

type AdminUser = {
  id: number;
  userId: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  adminTotpEnabled: boolean;
  adminTotpEnabledAt: string | null;
  adminTotpSetupPending: boolean;
  player: {
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

type DetailResponse = {
  currentAdmin: CurrentAdmin;
  user: AdminUser;
  message?: string;
};

const cardStyle = {
  border: "1px solid rgba(56, 189, 248, 0.22)",
  background: "rgba(8, 20, 42, 0.82)",
  borderRadius: 18,
  padding: 20,
} as const;

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 26,
  borderRadius: 999,
  padding: "0 11px",
  border: "1px solid rgba(125, 211, 252, 0.28)",
  background: "rgba(14, 165, 233, 0.12)",
  color: "#dff7ff",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "-0.02em",
} as const;

export default function AdminUserDetailPage() {
  const params = useParams<{ userAccountId: string }>();
  const router = useRouter();
  const userAccountId = params.userAccountId;
  const [user, setUser] = useState<AdminUser | null>(null);
  const [currentAdmin, setCurrentAdmin] = useState<CurrentAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const isSuperAdmin = currentAdmin?.role === "SUPER_ADMIN";
  const canManageSensitive = isSuperAdmin && user?.role !== "SUPER_ADMIN";

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/users/${userAccountId}/details`, { cache: "no-store" });
      const data = (await res.json()) as DetailResponse;

      if (!res.ok) {
        alert(data.message || "회원 상세 조회 실패");
        router.push("/admin/users");
        return;
      }

      setCurrentAdmin(data.currentAdmin);
      setUser(data.user);
    } catch (error) {
      console.error("[ADMIN_USER_DETAIL_FETCH_ERROR]", error);
      alert("회원 상세를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [router, userAccountId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const request = async (url: string, options: RequestInit, successMessage?: string) => {
    try {
      setBusy(true);
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.message || "처리 실패");
        return data;
      }

      if (successMessage || data.message) alert(successMessage || data.message);
      await fetchDetail();
      return data;
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = () => request(`/api/admin/users/${userAccountId}/approve`, { method: "PATCH" });

  const handleReject = () => {
    const reason = window.prompt("거절 사유를 입력하세요. 비워두면 사유 없이 처리됩니다.") ?? "";
    return request(`/api/admin/users/${userAccountId}/reject`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  };

  const handleResetStatus = () => {
    if (!window.confirm("해당 회원 상태를 승인 대기로 되돌리겠습니까?")) return;
    return request(`/api/admin/users/${userAccountId}/reset`, { method: "PATCH" });
  };

  const handleRoleChange = (nextRole: "USER" | "ADMIN") => {
    if (!user) return;
    const message = nextRole === "ADMIN"
      ? `${user.userId} 계정을 관리자로 지정하겠습니까?`
      : `${user.userId} 계정의 관리자 권한을 해제하겠습니까?`;
    if (!window.confirm(message)) return;

    return request(`/api/admin/users/${userAccountId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
  };

  const handlePasswordReset = async () => {
    if (!user) return;
    if (!window.confirm(`${user.userId} 계정의 비밀번호를 임시 비밀번호로 초기화하겠습니까?`)) return;

    const data = await request(`/api/admin/users/${userAccountId}/password-reset`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (data?.tempPassword) {
      window.alert(`임시 비밀번호: ${data.tempPassword}\n해당 유저에게 전달 후 로그인 뒤 비밀번호 변경을 안내하세요.`);
    }
  };

  const handleTwoFactorReset = () => {
    if (!user) return;
    if (!window.confirm(`${user.userId} 계정의 2단계 인증을 초기화하겠습니까?\n해당 관리자는 인증앱을 다시 등록해야 합니다.`)) return;

    return request(`/api/admin/users/${userAccountId}/2fa-reset`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  };

  const summary = useMemo(() => {
    if (!user) return [];
    return [
      ["아이디", user.userId],
      ["이름", user.player?.name ?? "-"],
      ["닉네임#태그", formatRiotName(user.player?.nickname, user.player?.tag)],
      ["최고 티어", formatTier(user.player?.peakTier)],
      ["현재 티어", formatTier(user.player?.currentTier)],
      ["가입일", formatDate(user.createdAt)],
      ["Discord", user.discord?.id ? "연동됨" : "미연동"],
    ];
  }, [user]);

  if (loading) {
    return <main className="admin-page"><div className="admin-empty">회원 상세를 불러오는 중입니다.</div></main>;
  }

  if (!user) {
    return <main className="admin-page"><div className="admin-empty">회원을 찾을 수 없습니다.</div></main>;
  }

  return (
    <main className="admin-page" style={{ width: "min(1080px, calc(100vw - 48px))", maxWidth: 1080 }}>
      <div className="admin-page__header">
        <div>
          <p className="admin-muted">User Account Detail</p>
          <h1 className="admin-page__title">회원 상세 관리</h1>
          <p className="admin-page__description">목록에서는 상세/삭제만 노출하고, 승인·권한·비밀번호·2FA 관리는 이 화면에서 처리합니다.</p>
        </div>
        <Link className="admin-button admin-button--ghost" href="/admin/users">목록으로</Link>
      </div>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)" }}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>기본 정보</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            {summary.map(([label, value]) => (
              <div key={label} style={{ border: "1px solid rgba(148, 163, 184, 0.16)", borderRadius: 14, padding: 12, background: "rgba(2, 6, 23, 0.32)" }}>
                <div className="admin-muted" style={{ fontSize: 12 }}>{label}</div>
                <div style={{ marginTop: 6, fontWeight: 800 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>현재 상태</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <StatusBadge status={user.status} />
            <RoleBadge role={user.role} />
            <TwoFactorBadge user={user} />
          </div>
          <p className="admin-muted" style={{ marginTop: 14 }}>
            2FA 등록일: {user.adminTotpEnabledAt ? formatDate(user.adminTotpEnabledAt) : "-"}
          </p>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>상태 관리</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button className="admin-button" type="button" disabled={busy || user.status === "APPROVED"} onClick={handleApprove}>승인</button>
          <button className="admin-button admin-button--danger" type="button" disabled={busy || user.status === "REJECTED"} onClick={handleReject}>거절</button>
          <button className="admin-button admin-button--ghost" type="button" disabled={busy || user.status === "PENDING"} onClick={handleResetStatus}>승인 대기로</button>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>권한 / 보안 관리</h2>
        <p className="admin-muted">권한 변경, 비밀번호 초기화, 2단계 인증 초기화는 최고 관리자만 처리할 수 있습니다.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {canManageSensitive && user.role === "USER" ? (
            <button className="admin-button" type="button" disabled={busy || user.status !== "APPROVED"} onClick={() => handleRoleChange("ADMIN")}>관리자 지정</button>
          ) : null}

          {canManageSensitive && user.role === "ADMIN" ? (
            <button className="admin-button admin-button--danger" type="button" disabled={busy} onClick={() => handleRoleChange("USER")}>관리자 해제</button>
          ) : null}

          {canManageSensitive ? (
            <button className="admin-button" type="button" disabled={busy} onClick={handlePasswordReset}>비밀번호 초기화</button>
          ) : null}

          {canManageSensitive && (user.adminTotpEnabled || user.adminTotpSetupPending) ? (
            <button className="admin-button admin-button--danger" type="button" disabled={busy} onClick={handleTwoFactorReset}>2FA 초기화</button>
          ) : null}

          {!canManageSensitive ? <div className="admin-muted">현재 계정에서는 민감 작업을 수행할 수 없습니다.</div> : null}
        </div>
      </section>
    </main>
  );
}

function TwoFactorBadge({ user }: { user: AdminUser }) {
  const label = user.adminTotpEnabled ? "2FA 활성" : user.adminTotpSetupPending ? "2FA 설정중" : "2FA 미사용";
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

  return <span style={{ ...badgeStyle, borderColor, background }}>{label}</span>;
}

function StatusBadge({ status }: { status: UserStatus }) {
  const label = status === "PENDING" ? "승인 대기" : status === "APPROVED" ? "승인 완료" : "거절됨";
  return <span style={badgeStyle}>{label}</span>;
}

function RoleBadge({ role }: { role: UserRole }) {
  const label = role === "SUPER_ADMIN" ? "최고관리자" : role === "ADMIN" ? "관리자" : "일반";
  return <span style={badgeStyle}>{label}</span>;
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}