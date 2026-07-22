"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";
type UserStatus = "PENDING" | "APPROVED" | "REJECTED";
type TierBase =
  | ""
  | "아이언"
  | "브론즈"
  | "실버"
  | "골드"
  | "플래티넘"
  | "에메랄드"
  | "다이아"
  | "마스터"
  | "그랜드마스터"
  | "챌린저";
type TierInputState = {
  base: TierBase;
  detail: string;
};

const TIER_OPTIONS: { value: TierBase; label: string }[] = [
  { value: "", label: "선택 없음" },
  { value: "아이언", label: "아이언" },
  { value: "브론즈", label: "브론즈" },
  { value: "실버", label: "실버" },
  { value: "골드", label: "골드" },
  { value: "플래티넘", label: "플래티넘" },
  { value: "에메랄드", label: "에메랄드" },
  { value: "다이아", label: "다이아" },
  { value: "마스터", label: "마스터" },
  { value: "그랜드마스터", label: "그랜드마스터" },
  { value: "챌린저", label: "챌린저" },
];

const DIVISION_OPTIONS = ["1", "2", "3", "4"];
const MASTER_PLUS_TIERS = new Set<TierBase>([
  "마스터",
  "그랜드마스터",
  "챌린저",
]);

type PlayerDetail = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
  balanceOverrideScore: number | null;
  balanceOverrideReason: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  userAccount: {
    id: number;
    userId: string;
    role: UserRole;
    status: UserStatus;
    createdAt: string;
    adminTotpEnabled: boolean;
    adminTotpEnabledAt: string | null;
    adminTotpSetupPending: boolean;
  } | null;
  _count: {
    participants: number;
    seasonStats: number;
    championStats: number;
    destructionParticipants: number;
    eventParticipants: number;
    disciplineRecords: number;
  };
};

type CurrentAdmin = {
  id: number | null;
  userId: string;
  role: UserRole;
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

export default function PlayerManageDetailClient({
  player,
  currentAdmin,
}: {
  player: PlayerDetail;
  currentAdmin: CurrentAdmin;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(player.name);
  const [nickname, setNickname] = useState(player.nickname);
  const [tag, setTag] = useState(player.tag);
  const [peakTier, setPeakTier] = useState<TierInputState>(() =>
    parseTierInput(player.peakTier),
  );
  const [currentTier, setCurrentTier] = useState<TierInputState>(() =>
    parseTierInput(player.currentTier),
  );
  const [balanceOverrideScore, setBalanceOverrideScore] = useState(
    String(player.balanceOverrideScore ?? 0),
  );
  const [balanceOverrideReason, setBalanceOverrideReason] = useState(
    player.balanceOverrideReason ?? "",
  );

  const account = player.userAccount;
  const isSuperAdmin = currentAdmin.role === "SUPER_ADMIN";
  const canManageSensitive = Boolean(
    account && isSuperAdmin && account.role !== "SUPER_ADMIN",
  );

  const request = async (
    url: string,
    options: RequestInit,
    successMessage?: string,
  ) => {
    try {
      setBusy(true);
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.message || "처리 실패");
        return data;
      }

      if (successMessage || data.message) alert(successMessage || data.message);
      router.refresh();
      return data;
    } finally {
      setBusy(false);
    }
  };

  const handlePlayerUpdate = async () => {
    if (!name.trim() || !nickname.trim() || !tag.trim()) {
      alert("이름, 닉네임, 태그는 필수입니다.");
      return;
    }

    await request(`/api/players/${player.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        nickname: nickname.trim(),
        tag: tag.replace(/^#/, "").trim(),
        peakTier: buildTierValue(peakTier),
        currentTier: buildTierValue(currentTier),
        balanceOverrideScore: Number(balanceOverrideScore || 0),
        balanceOverrideReason: balanceOverrideReason.trim() || null,
      }),
    });
  };

  const handleDeactivate = async () => {
    if (
      !window.confirm(
        "이 플레이어를 비활성화하시겠습니까? 기존 경기/통계 기록은 보존됩니다.",
      )
    )
      return;
    await request(`/api/players/${player.id}`, { method: "DELETE" });
  };

  const handleRoleChange = async (nextRole: "USER" | "ADMIN") => {
    if (!account) return;
    const message =
      nextRole === "ADMIN"
        ? `${account.userId} 계정을 관리자로 지정하겠습니까?`
        : `${account.userId} 계정의 관리자 권한을 해제하겠습니까?`;
    if (!window.confirm(message)) return;

    await request(`/api/admin/users/${account.id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
  };

  const handlePasswordReset = async () => {
    if (!account) return;
    if (
      !window.confirm(
        `${account.userId} 계정의 비밀번호를 임시 비밀번호로 초기화하겠습니까?`,
      )
    )
      return;

    const data = await request(
      `/api/admin/users/${account.id}/password-reset`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    if (data?.tempPassword) {
      window.alert(
        `임시 비밀번호: ${data.tempPassword}\n해당 유저에게 전달 후 로그인 뒤 비밀번호 변경을 안내하세요.`,
      );
    }
  };

  const handleTwoFactorReset = async () => {
    if (!account) return;
    if (
      !window.confirm(`${account.userId} 계정의 2단계 인증을 초기화하겠습니까?`)
    )
      return;

    await request(`/api/admin/users/${account.id}/2fa-reset`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  };

  return (
    <main
      className="admin-page"
      style={{ width: "min(1080px, calc(100vw - 48px))", maxWidth: 1080 }}
    >
      <div className="admin-page__header">
        <div>
          <p className="admin-muted">Player Management Detail</p>
          <h1 className="admin-page__title">플레이어 상세 관리</h1>
          <p className="admin-page__description">
            플레이어 정보, 자동 승인된 사이트 계정, 권한/보안 관리 기능을 한
            화면에서 처리합니다.
          </p>
        </div>
        <Link
          className="admin-button admin-button--ghost"
          href="/admin/players"
        >
          목록으로
        </Link>
      </div>

      <section
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.9fr)",
        }}
      >
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>플레이어 정보 수정</h2>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="이름" value={name} onChange={setName} />
            <Field label="닉네임" value={nickname} onChange={setNickname} />
            <Field label="태그" value={tag} onChange={setTag} />
            <TierField
              label="최고 티어"
              value={peakTier}
              onChange={setPeakTier}
            />
            <TierField
              label="현재 티어"
              value={currentTier}
              onChange={setCurrentTier}
            />
            <Field
              label="밸런스 수동 보정 점수 (-10 ~ +10)"
              value={balanceOverrideScore}
              onChange={setBalanceOverrideScore}
              type="number"
            />
            <div>
              <label style={{ fontWeight: 800 }}>밸런스 보정 사유</label>
              <textarea aria-label="예: 최근 내전 체감 실력 +3, 휴면 복귀 -4"
                className="app-input"
                value={balanceOverrideReason}
                onChange={(e) => setBalanceOverrideReason(e.target.value)}
                placeholder="예: 최근 내전 체감 실력 +3, 휴면 복귀 -4"
                rows={3}
                style={{ width: "100%", marginTop: 8, resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="admin-button"
                type="button"
                disabled={busy}
                onClick={handlePlayerUpdate}
              >
                수정 저장
              </button>
              <Link
                className="admin-button admin-button--ghost"
                href={`/players/${player.id}`}
              >
                유저 상세 보기
              </Link>
              <Link
                className="admin-button admin-button--ghost"
                href={`/admin/players/${player.id}/balance`}
              >
                MMR 상세
              </Link>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>상태 요약</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={badgeStyle}>
              {player.isActive ? "활성" : "비활성"}
            </span>
            <span style={badgeStyle}>
              {account ? "계정 연결" : "계정 미연결"}
            </span>
            {account ? (
              <span style={badgeStyle}>{getStatusLabel(account.status)}</span>
            ) : null}
            {account ? (
              <span style={badgeStyle}>{getRoleLabel(account.role)}</span>
            ) : null}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
              marginTop: 16,
            }}
          >
            <Summary
              label="내전 참가"
              value={`${player._count.participants}건`}
            />
            <Summary
              label="시즌 통계"
              value={`${player._count.seasonStats}건`}
            />
            <Summary
              label="챔피언 통계"
              value={`${player._count.championStats}건`}
            />
            <Summary
              label="경고/주의"
              value={`${player._count.disciplineRecords}건`}
            />
          </div>

          <p className="admin-muted" style={{ marginTop: 14 }}>
            등록일: {formatDate(player.createdAt)}
            {player.deactivatedAt
              ? ` · 비활성: ${formatDate(player.deactivatedAt)}`
              : ""}
          </p>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>사이트 계정 / 자동 승인 정보</h2>
        {account ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <Summary label="아이디" value={account.userId} />
              <Summary
                label="승인 상태"
                value={getStatusLabel(account.status)}
              />
              <Summary label="권한" value={getRoleLabel(account.role)} />
              <Summary label="가입일" value={formatDate(account.createdAt)} />
              <Summary
                label="2FA"
                value={
                  account.adminTotpEnabled
                    ? "활성"
                    : account.adminTotpSetupPending
                      ? "설정중"
                      : "미사용"
                }
              />
            </div>
            <p className="admin-muted" style={{ marginTop: 12 }}>
              현재 회원가입은 자동 승인 방식입니다. 승인/거절 버튼은 제거하고,
              이 화면에서는 연결된 계정의 권한과 보안만 관리합니다.
            </p>
          </>
        ) : (
          <div className="admin-empty">
            연결된 사이트 계정이 없습니다. 해당 플레이어는 전적/운영 데이터만
            보유한 상태입니다.
          </div>
        )}
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>권한 / 보안 관리</h2>
        <p className="admin-muted">
          관리자 지정, 비밀번호 초기화, 2FA 초기화는 최고 관리자만 처리할 수
          있습니다.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {canManageSensitive && account?.role === "USER" ? (
            <button
              className="admin-button"
              type="button"
              disabled={busy}
              onClick={() => handleRoleChange("ADMIN")}
            >
              관리자 지정
            </button>
          ) : null}

          {canManageSensitive && account?.role === "ADMIN" ? (
            <button
              className="admin-button admin-button--danger"
              type="button"
              disabled={busy}
              onClick={() => handleRoleChange("USER")}
            >
              관리자 해제
            </button>
          ) : null}

          {canManageSensitive ? (
            <button
              className="admin-button"
              type="button"
              disabled={busy}
              onClick={handlePasswordReset}
            >
              비밀번호 초기화
            </button>
          ) : null}

          {canManageSensitive &&
          account &&
          (account.adminTotpEnabled || account.adminTotpSetupPending) ? (
            <button
              className="admin-button admin-button--danger"
              type="button"
              disabled={busy}
              onClick={handleTwoFactorReset}
            >
              2FA 초기화
            </button>
          ) : null}

          {!account ? (
            <div className="admin-muted">
              연결된 계정이 없어 계정 보안 작업을 수행할 수 없습니다.
            </div>
          ) : null}
          {account && !canManageSensitive ? (
            <div className="admin-muted">
              현재 계정에서는 민감 작업을 수행할 수 없습니다.
            </div>
          ) : null}
        </div>
      </section>

      <section
        style={{
          ...cardStyle,
          marginTop: 16,
          borderColor: "rgba(248, 113, 113, 0.28)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>위험 영역</h2>
        <p className="admin-muted">
          비활성화는 전적과 통계를 보존합니다. 완전 삭제는 별도 DB 정리
          대상이므로 이 화면에서는 제공하지 않습니다.
        </p>
        <button
          className="admin-button admin-button--danger"
          type="button"
          disabled={busy || !player.isActive}
          onClick={handleDeactivate}
        >
          플레이어 비활성화
        </button>
      </section>
    </main>
  );
}

function TierField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TierInputState;
  onChange: (value: TierInputState) => void;
}) {
  const isMasterPlus = MASTER_PLUS_TIERS.has(value.base);
  const detailLabel = "점수";
  const detailPlaceholder = value.base === "마스터" ? "예: 720" : "예: 500";

  const setBase = (base: TierBase) => {
    if (!base) {
      onChange({ base: "", detail: "" });
      return;
    }

    if (MASTER_PLUS_TIERS.has(base)) {
      onChange({ base, detail: value.detail.replace(/\D/g, "") || (base === "마스터" ? "100" : "0") });
      return;
    }

    onChange({
      base,
      detail: DIVISION_OPTIONS.includes(value.detail) ? value.detail : "1",
    });
  };

  const setDetail = (detail: string) => {
    const nextDetail = isMasterPlus ? detail.replace(/\D/g, "") : detail;
    onChange({ ...value, detail: nextDetail });
  };

  return (
    <div>
      <label style={{ fontWeight: 800 }}>{label}</label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMasterPlus ? "1fr 140px" : "1fr 120px",
          gap: 8,
          marginTop: 8,
        }}
      >
        <select
          aria-label={`${label} 티어`}
          className="app-input"
          value={value.base}
          onChange={(e) => setBase(e.target.value as TierBase)}
          style={{ width: "100%" }}
        >
          {TIER_OPTIONS.map((tier) => (
            <option key={tier.value || "none"} value={tier.value}>
              {tier.label}
            </option>
          ))}
        </select>

        {value.base ? (
          isMasterPlus ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input aria-label={detailPlaceholder}
                className="app-input"
                type="number"
                min={0}
                max={value.base === "마스터" ? 999 : undefined}
                value={value.detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder={detailPlaceholder}
                style={{ width: "100%" }}
              />
              <span className="admin-muted" style={{ whiteSpace: "nowrap" }}>
                {detailLabel}
              </span>
            </div>
          ) : (
            <select
              aria-label={`${label} 단계`}
              className="app-input"
              value={value.detail || "1"}
              onChange={(e) => setDetail(e.target.value)}
              style={{ width: "100%" }}
            >
              {DIVISION_OPTIONS.map((division) => (
                <option key={division} value={division}>
                  {division}
                </option>
              ))}
            </select>
          )
        ) : (
          <input
            aria-label={`${label} 상세`}
            className="app-input"
            value="-"
            disabled
            style={{ width: "100%", opacity: 0.7 }}
          />
        )}
      </div>
      <p className="admin-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
        {value.base
          ? `저장값: ${describeTierSaveValue(value)}`
          : "티어 없음으로 저장됩니다."}
      </p>
    </div>
  );
}

function parseTierInput(value?: string | null): TierInputState {
  const normalized = value?.trim();
  if (!normalized) return { base: "", detail: "" };

  const [baseRaw, detailRaw] = normalized.split(/\s+/, 2);
  const base = TIER_OPTIONS.some((tier) => tier.value === baseRaw)
    ? (baseRaw as TierBase)
    : "";
  if (!base) return { base: "", detail: "" };

  if (base === "마스터") {
    const raw = detailRaw ?? "";
    const numeric = raw.replace(/\D/g, "");
    if (!numeric) return { base, detail: "100" };
    if (raw.includes("층")) {
      return { base, detail: String(clampNumber(numeric, 1, 10) * 100) };
    }
    return { base, detail: String(clampNumber(numeric, 0, 999)) };
  }

  if (base === "그랜드마스터" || base === "챌린저") {
    const numeric = (detailRaw ?? "").replace(/\D/g, "");
    return { base, detail: numeric || "0" };
  }

  return {
    base,
    detail: DIVISION_OPTIONS.includes(detailRaw ?? "")
      ? (detailRaw ?? "1")
      : "1",
  };
}

function buildTierValue(value: TierInputState) {
  if (!value.base) return null;

  if (value.base === "마스터") {
    const score = clampNumber(value.detail, 0, 999);
    const floor = scoreToMasterFloor(score);
    return `마스터 ${floor}층`;
  }

  if (value.base === "그랜드마스터" || value.base === "챌린저") {
    const score = clampNumber(value.detail, 0, 9999);
    return `${value.base} ${score}`;
  }

  const division = DIVISION_OPTIONS.includes(value.detail) ? value.detail : "1";
  return `${value.base} ${division}`;
}

function describeTierSaveValue(value: TierInputState) {
  if (!value.base) return "-";
  if (value.base === "마스터") {
    const score = clampNumber(value.detail, 0, 999);
    return `${score}점 입력 → DB 저장값: 마스터 ${scoreToMasterFloor(score)}층`;
  }
  return buildTierValue(value) ?? "-";
}

function scoreToMasterFloor(score: number) {
  return Math.max(1, Math.min(10, Math.floor(score / 100)));
}

function clampNumber(value: string, min: number, max: number) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label style={{ fontWeight: 800 }}>{label}</label>
      <input aria-label={placeholder}
        className="app-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", marginTop: 8 }}
      />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(148, 163, 184, 0.16)",
        borderRadius: 14,
        padding: 12,
        background: "rgba(2, 6, 23, 0.32)",
        minWidth: 0,
      }}
    >
      <div className="admin-muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontWeight: 800,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function getStatusLabel(status: UserStatus) {
  if (status === "APPROVED") return "자동 승인";
  if (status === "PENDING") return "대기";
  if (status === "REJECTED") return "거절";
  return status;
}

function getRoleLabel(role: UserRole) {
  if (role === "SUPER_ADMIN") return "최고관리자";
  if (role === "ADMIN") return "관리자";
  return "일반";
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
