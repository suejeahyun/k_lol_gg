"use client";

import { Clipboard, Dices, RotateCcw, Sparkles, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import {
  createRandomTeams,
  createTierBalancedTeams,
  parseRandomTeamInput,
  SIMPLE_TIER_SCORES,
  tierScore,
  type RandomTeamResult,
  type SimpleTier,
  type TierBalanceResult,
} from "@/modules/team-tools";

import styles from "../team-tools.module.css";

type TeamMode = "random" | "tier";
type DisplayResult =
  | Readonly<{ kind: "random"; value: RandomTeamResult }>
  | Readonly<{ kind: "tier"; value: TierBalanceResult }>;

const TIER_LABELS: Readonly<Record<SimpleTier, string>> = {
  IRON: "아이언",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};

function browserUint32() {
  const value = new Uint32Array(1);
  window.crypto.getRandomValues(value);
  return value[0]!;
}

function resultText(result: DisplayResult) {
  const teamText = (title: string, players: readonly { name: string; tier?: SimpleTier }[]) =>
    `${title}\n${players.map((player, index) => `${index + 1}. ${player.name}${player.tier ? ` · ${TIER_LABELS[player.tier]}` : ""}`).join("\n")}`;

  const detail = result.kind === "tier"
    ? `\n\n점수 차이 ${result.value.difference}점 (${result.value.teamOneScore} : ${result.value.teamTwoScore})`
    : "";
  return `${teamText("1팀", result.value.teamOne)}\n\n${teamText("2팀", result.value.teamTwo)}${detail}`;
}

export function RandomTeamTool({ initialMode }: { initialMode: TeamMode }) {
  const [mode, setMode] = useState<TeamMode>(initialMode);
  const [rawInput, setRawInput] = useState("");
  const [tiers, setTiers] = useState<Partial<Record<number, SimpleTier>>>({});
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const parsed = useMemo(() => parseRandomTeamInput(rawInput), [rawInput]);

  const participants = parsed.ok ? parsed.value.participants : parsed.participants;

  function clearFeedback() {
    setResult(null);
    setError(null);
    setCopyStatus("");
  }

  function selectMode(nextMode: TeamMode) {
    setMode(nextMode);
    clearFeedback();
  }

  function createTeams() {
    setCopyStatus("");

    if (!parsed.ok) {
      setResult(null);
      setError(
        parsed.actual === 0
          ? "참가자 이름 10명을 한 줄에 한 명씩 입력해 주세요."
          : `현재 ${parsed.actual}명입니다. 정확히 10명이 필요해요.`,
      );
      return;
    }

    try {
      if (mode === "random") {
        setResult({ kind: "random", value: createRandomTeams(parsed.value.participants, browserUint32) });
      } else {
        const missing = parsed.value.participants.filter((participant) => !tiers[participant.slot]);
        if (missing.length > 0) {
          setResult(null);
          setError(`티어를 선택하지 않은 참가자가 ${missing.length}명 있어요.`);
          return;
        }

        const tierParticipants = parsed.value.participants.map((participant) => {
          const tier = tiers[participant.slot]!;
          return { ...participant, tier, tierScore: tierScore(tier) };
        });
        setResult({ kind: "tier", value: createTierBalancedTeams(tierParticipants) });
      }
      setError(null);
    } catch {
      setResult(null);
      setError("팀을 만드는 중 문제가 생겼어요. 브라우저를 새로고침한 뒤 다시 시도해 주세요.");
    }
  }

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(resultText(result));
      setCopyStatus("팀 결과를 클립보드에 복사했어요.");
    } catch {
      setCopyStatus("복사하지 못했어요. 결과를 직접 선택해 복사해 주세요.");
    }
  }

  function reset() {
    setRawInput("");
    setTiers({});
    clearFeedback();
  }

  return (
    <div className={styles.workspace}>
      <form className={styles.panel} onSubmit={(event) => { event.preventDefault(); createTeams(); }} noValidate>
        <div className={styles.heading}>
          <div><span>PARTICIPANTS</span><h2>참가자 입력</h2></div>
          <strong className={styles.count} aria-live="polite">{participants.length} / 10명</strong>
        </div>

        <div className={styles.modeTabs} role="group" aria-label="팀 나누기 방식">
          <button type="button" aria-pressed={mode === "random"} onClick={() => selectMode("random")}>무작위</button>
          <button type="button" aria-pressed={mode === "tier"} onClick={() => selectMode("tier")}>티어 균형</button>
        </div>

        <label className={styles.fieldLabel} htmlFor="random-team-participants">
          참가자 이름
          <textarea
            id="random-team-participants"
            value={rawInput}
            onChange={(event) => {
              setRawInput(event.target.value);
              setTiers({});
              clearFeedback();
            }}
            placeholder={"하늘여우\n별빛토끼\n구름고양이\n... 한 줄에 한 명"}
            aria-describedby="random-team-input-hint"
            aria-invalid={Boolean(error && !parsed.ok)}
          />
        </label>
        <p className={styles.fieldHint} id="random-team-input-hint">번호, 글머리표는 자동으로 제거해요. 같은 이름은 서로 다른 참가 슬롯으로 유지합니다.</p>

        {parsed.ok && parsed.value.duplicateNames.length > 0 ? (
          <p className={styles.notice} role="status">같은 이름이 있어요: {parsed.value.duplicateNames.join(", ")}. 입력 순서가 다른 참가자로 나눕니다.</p>
        ) : null}

        {mode === "tier" && parsed.ok ? (
          <fieldset className={styles.tierGrid}>
            <legend className="sr-only">참가자별 티어</legend>
            {parsed.value.participants.map((participant, index) => (
              <label key={participant.slot}>
                <span aria-hidden="true">{index + 1}</span>
                <span>{participant.name}</span>
                <select
                  value={tiers[participant.slot] ?? ""}
                  onChange={(event) => {
                    setTiers((current) => ({ ...current, [participant.slot]: event.target.value as SimpleTier }));
                    clearFeedback();
                  }}
                  aria-label={`${participant.name} 티어`}
                  required
                >
                  <option value="">티어 선택</option>
                  {(Object.keys(SIMPLE_TIER_SCORES) as SimpleTier[]).map((tier) => (
                    <option value={tier} key={tier}>{TIER_LABELS[tier]} · {SIMPLE_TIER_SCORES[tier]}점</option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        ) : null}

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.actions}>
          <button className={styles.primaryButton} type="submit"><Dices size={18} aria-hidden="true" /> {mode === "random" ? "팀 섞기" : "균형 팀 만들기"}</button>
          <button className={styles.secondaryButton} type="button" onClick={reset}><RotateCcw size={17} aria-hidden="true" /> 초기화</button>
        </div>
      </form>

      <section className={styles.resultPanel} aria-labelledby="random-team-result-title">
        <div className={styles.heading}>
          <div><span>RESULT</span><h2 id="random-team-result-title">팀 결과</h2></div>
          {result ? <strong className={styles.count}>5 : 5</strong> : null}
        </div>

        {!result ? (
          <div className={styles.emptyState} role="status">
            <UsersRound aria-hidden="true" />
            <h2>아직 만든 팀이 없어요</h2>
            <p>참가자 10명을 입력하고 팀 만들기 버튼을 누르면 이곳에 결과가 나타납니다.</p>
          </div>
        ) : (
          <>
            <div className={styles.teams} aria-live="polite">
              {(["teamOne", "teamTwo"] as const).map((teamKey, teamIndex) => (
                <article className={styles.teamCard} key={teamKey}>
                  <h3>{teamIndex === 0 ? "1팀" : "2팀"}<span>5명</span></h3>
                  <ol>
                    {result.value[teamKey].map((participant) => (
                      <li key={participant.slot}>
                        <span>{participant.name}</span>
                        {"tier" in participant ? <small>{TIER_LABELS[participant.tier]}</small> : null}
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
            {result.kind === "tier" ? (
              <div className={styles.resultSummary}>
                <span>팀 점수 {result.value.teamOneScore} : {result.value.teamTwoScore}</span>
                <span>최소 차이 {result.value.difference}점</span>
                <span>동률 최적안 {result.value.equallyOptimalLayoutCount}개 중 고정 규칙 선택</span>
              </div>
            ) : null}
            <div className={styles.actions}>
              <button className={styles.primaryButton} type="button" onClick={copyResult}><Clipboard size={17} aria-hidden="true" /> 결과 복사</button>
              <button className={styles.secondaryButton} type="button" onClick={createTeams}><Sparkles size={17} aria-hidden="true" /> 다시 만들기</button>
            </div>
          </>
        )}
        <p className={styles.fieldHint} role="status" aria-live="polite">{copyStatus}</p>
      </section>
    </div>
  );
}
