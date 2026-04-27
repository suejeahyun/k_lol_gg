"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TierType = "basic" | "master" | "high";

const BASIC_TIERS = ["아이언", "브론즈", "실버", "골드", "플래티넘", "에메랄드", "다이아"];
const MASTER_TIERS = ["마스터"];
const HIGH_TIERS = ["그랜드마스터", "챌린저"];
const BASIC_DIVISIONS = ["1", "2", "3", "4"];
const MASTER_FLOORS = Array.from({ length: 10 }, (_, i) => String(i + 1));
const ALL_TIERS = [...BASIC_TIERS, ...MASTER_TIERS, ...HIGH_TIERS];

function getTierType(tier: string): TierType {
  if (BASIC_TIERS.includes(tier)) return "basic";
  if (MASTER_TIERS.includes(tier)) return "master";
  return "high";
}

function buildTierValue(tier: string, detail: string): string {
  if (!tier) return "";
  if (BASIC_TIERS.includes(tier)) return detail ? `${tier} ${detail}` : "";
  if (MASTER_TIERS.includes(tier)) return detail ? `${tier} ${detail}층` : "";
  if (HIGH_TIERS.includes(tier)) return detail ? `${tier} ${detail}` : "";
  return "";
}

export default function SignupPage() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");

  const [peakTier, setPeakTier] = useState("");
  const [peakDetail, setPeakDetail] = useState("");
  const [currentTier, setCurrentTier] = useState("");
  const [currentDetail, setCurrentDetail] = useState("");

  const [loading, setLoading] = useState(false);

  const peakType = useMemo(() => getTierType(peakTier), [peakTier]);
  const currentType = useMemo(() => getTierType(currentTier), [currentTier]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setLoading(true);

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          password,
          nickname,
          tag,
          peakTier: buildTierValue(peakTier, peakDetail),
          currentTier: buildTierValue(currentTier, currentDetail),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "회원가입 실패");
        return;
      }

      alert("회원가입 신청이 완료되었습니다. 관리자 승인 후 이용할 수 있습니다.");
      router.push("/login");
    } catch (error: unknown) {
      console.error("[SIGNUP_ERROR]", error);
      alert("회원가입 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">회원가입</h1>

        <label className="auth-field">
          <span>아이디</span>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>

        <label className="auth-field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="auth-field">
          <span>닉네임</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </label>

        <label className="auth-field">
          <span>태그</span>
          <input value={tag} onChange={(e) => setTag(e.target.value)} />
        </label>

        <TierSelector
          title="최고 티어"
          tier={peakTier}
          detail={peakDetail}
          type={peakType}
          onTierChange={(value) => {
            setPeakTier(value);
            setPeakDetail("");
          }}
          onDetailChange={setPeakDetail}
        />

        <TierSelector
          title="현재 티어"
          tier={currentTier}
          detail={currentDetail}
          type={currentType}
          onTierChange={(value) => {
            setCurrentTier(value);
            setCurrentDetail("");
          }}
          onDetailChange={setCurrentDetail}
        />

        <button className="auth-button" type="submit" disabled={loading}>
          {loading ? "신청 중..." : "회원가입 신청"}
        </button>
      </form>
    </div>
  );
}

function TierSelector({
  title,
  tier,
  detail,
  type,
  onTierChange,
  onDetailChange,
}: {
  title: string;
  tier: string;
  detail: string;
  type: TierType;
  onTierChange: (value: string) => void;
  onDetailChange: (value: string) => void;
}) {
  return (
    <div className="auth-tier-section">
      <div className="auth-tier-title">{title}</div>

      <div className="auth-tier-row">
        <select value={tier} onChange={(e) => onTierChange(e.target.value)}>
          <option value="">선택 안함</option>
          {ALL_TIERS.map((tierName) => (
            <option key={tierName} value={tierName}>
              {tierName}
            </option>
          ))}
        </select>

        {tier && type === "basic" ? (
          <select value={detail} onChange={(e) => onDetailChange(e.target.value)}>
            <option value="">단계 선택</option>
            {BASIC_DIVISIONS.map((division) => (
              <option key={division} value={division}>
                {division}
              </option>
            ))}
          </select>
        ) : null}

        {tier && type === "master" ? (
          <select value={detail} onChange={(e) => onDetailChange(e.target.value)}>
            <option value="">층 선택</option>
            {MASTER_FLOORS.map((floor) => (
              <option key={floor} value={floor}>
                {floor}층
              </option>
            ))}
          </select>
        ) : null}

        {tier && type === "high" ? (
          <input
            value={detail}
            onChange={(e) => onDetailChange(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="LP 입력"
            inputMode="numeric"
          />
        ) : null}
      </div>
    </div>
  );
}