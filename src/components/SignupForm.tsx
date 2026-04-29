"use client";

import { FormEvent, useMemo, useState } from "react";

const RANK_TIERS = [
  "아이언",
  "브론즈",
  "실버",
  "골드",
  "플래티넘",
  "에메랄드",
  "다이아",
  "마스터",
  "그랜드마스터",
  "챌린저",
] as const;

const DIVISIONS = ["4", "3", "2", "1"] as const;
const MASTER_FLOORS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

type Tier = (typeof RANK_TIERS)[number];

function buildTierValue(tier: Tier | "", division: string, lp: string) {
  if (!tier) return "";

  if (tier === "마스터") {
    return division ? `${tier} ${division}층` : "";
  }

  if (tier === "그랜드마스터" || tier === "챌린저") {
    return lp ? `${tier} ${lp}LP` : "";
  }

  return division ? `${tier} ${division}` : "";
}

type TierSelectorProps = {
  label: string;
  tier: Tier | "";
  setTier: (value: Tier | "") => void;
  division: string;
  setDivision: (value: string) => void;
  lp: string;
  setLp: (value: string) => void;
};

function TierSelector({
  label,
  tier,
  setTier,
  division,
  setDivision,
  lp,
  setLp,
}: TierSelectorProps) {
  const isMaster = tier === "마스터";
  const isLpTier = tier === "그랜드마스터" || tier === "챌린저";
  const isDivisionTier = tier && !isMaster && !isLpTier;

  return (
    <label className="auth-field">
      <span>{label}</span>

      <div className="auth-tier-row">
        <select
          value={tier}
          onChange={(e) => {
            const nextTier = e.target.value as Tier | "";
            setTier(nextTier);
            setDivision("");
            setLp("");
          }}
        >
          <option value="">티어 선택</option>
          {RANK_TIERS.map((rankTier) => (
            <option key={rankTier} value={rankTier}>
              {rankTier}
            </option>
          ))}
        </select>

        {isDivisionTier ? (
          <select
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          >
            <option value="">단계</option>
            {DIVISIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ) : null}

        {isMaster ? (
          <select
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          >
            <option value="">층수</option>
            {MASTER_FLOORS.map((value) => (
              <option key={value} value={value}>
                {value}층
              </option>
            ))}
          </select>
        ) : null}

        {isLpTier ? (
          <input
            value={lp}
            onChange={(e) => setLp(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="LP"
            inputMode="numeric"
          />
        ) : null}
      </div>
    </label>
  );
}

export default function SignupForm() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");

  const [currentTier, setCurrentTier] = useState<Tier | "">("");
  const [currentDivision, setCurrentDivision] = useState("");
  const [currentLp, setCurrentLp] = useState("");

  const [peakTier, setPeakTier] = useState<Tier | "">("");
  const [peakDivision, setPeakDivision] = useState("");
  const [peakLp, setPeakLp] = useState("");

  const [loading, setLoading] = useState(false);

  const currentTierValue = useMemo(
    () => buildTierValue(currentTier, currentDivision, currentLp),
    [currentTier, currentDivision, currentLp]
  );

  const peakTierValue = useMemo(
    () => buildTierValue(peakTier, peakDivision, peakLp),
    [peakTier, peakDivision, peakLp]
  );

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
          name,
          nickname,
          tag,
          currentTier: currentTierValue,
          peakTier: peakTierValue,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "회원가입 실패");
        return;
      }

      alert("회원가입이 완료되었습니다. 관리자 승인 후 이용 가능합니다.");
      window.location.href = "/login";
    } catch (error: unknown) {
      console.error("[SIGNUP_ERROR]", error);
      alert("회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">회원가입</h1>

        <label className="auth-field">
          <span>이름</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="대상혁"
          />
        </label>

        <label className="auth-field">
          <span>닉네임</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Hide On Bush"
          />
        </label>

        <label className="auth-field">
          <span>태그</span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="KR1"
          />
        </label>

        <TierSelector
          label="현재 티어"
          tier={currentTier}
          setTier={setCurrentTier}
          division={currentDivision}
          setDivision={setCurrentDivision}
          lp={currentLp}
          setLp={setCurrentLp}
        />

        <TierSelector
          label="최고 티어"
          tier={peakTier}
          setTier={setPeakTier}
          division={peakDivision}
          setDivision={setPeakDivision}
          lp={peakLp}
          setLp={setPeakLp}
        />

        <label className="auth-field">
          <span>아이디</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="6~20자"
          />
        </label>

        <label className="auth-field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8~32자"
          />
        </label>

        <button className="auth-button" type="submit" disabled={loading}>
          {loading ? "가입 중..." : "회원가입"}
        </button>
      </form>
    </div>
  );
}