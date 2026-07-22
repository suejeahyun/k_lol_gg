"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type TeamMode = "random" | "tier";

type TierId =
  | "IRON"
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "EMERALD"
  | "DIAMOND"
  | "MASTER"
  | "GRANDMASTER"
  | "CHALLENGER";

type TierOption = {
  id: TierId;
  label: string;
  score: number;
};

type TeamPlayer = {
  slot: number;
  name: string;
  tierId?: TierId;
};

type TeamResult = {
  mode: TeamMode;
  red: TeamPlayer[];
  blue: TeamPlayer[];
  redScore?: number;
  blueScore?: number;
  diff?: number;
};

const SAMPLE_TEXT = `구인구직을 붙여넣어 주세요.
1.
2.
3.
4.
5.
6.
7.
8.
9.
10.`;

const TIER_OPTIONS: TierOption[] = [
  { id: "IRON", label: "아이언", score: 1 },
  { id: "BRONZE", label: "브론즈", score: 2 },
  { id: "SILVER", label: "실버", score: 3 },
  { id: "GOLD", label: "골드", score: 4 },
  { id: "PLATINUM", label: "플래티넘", score: 5 },
  { id: "EMERALD", label: "에메랄드", score: 6 },
  { id: "DIAMOND", label: "다이아", score: 7 },
  { id: "MASTER", label: "마스터", score: 8 },
  { id: "GRANDMASTER", label: "그랜드마스터", score: 9 },
  { id: "CHALLENGER", label: "챌린저", score: 10 },
];

const TIER_SCORE = TIER_OPTIONS.reduce<Record<TierId, number>>((acc, tier) => {
  acc[tier.id] = tier.score;
  return acc;
}, {} as Record<TierId, number>);

const TIER_LABEL = TIER_OPTIONS.reduce<Record<TierId, string>>((acc, tier) => {
  acc[tier.id] = tier.label;
  return acc;
}, {} as Record<TierId, string>);

function cleanPlayerName(line: string) {
  return line
    .trim()
    .replace(/^\s*(?:\d{1,2}|[①②③④⑤⑥⑦⑧⑨⑩])\s*[.)、:\-]\s*/u, "")
    .replace(/^\s*[-•*]\s*/u, "")
    .trim();
}

function parseNames(rawText: string) {
  return rawText
    .split(/\r?\n/g)
    .map(cleanPlayerName)
    .filter(Boolean);
}

function randomIndex(maxExclusive: number) {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

function pickRandom<T>(items: T[]) {
  return items[randomIndex(items.length)];
}

function shuffleArray<T>(items: T[]) {
  const next = [...items];

  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [next[i], next[j]] = [next[j], next[i]];
  }

  return next;
}

function toPlayers(names: string[], tierBySlot: Record<number, TierId | ""> = {}) {
  return names.map((name, index) => ({
    slot: index,
    name,
    tierId: tierBySlot[index] || undefined,
  }));
}

function shuffleNames(names: string[]) {
  const next = shuffleArray(toPlayers(names));

  return {
    mode: "random",
    red: next.slice(0, 5),
    blue: next.slice(5, 10),
  } satisfies TeamResult;
}

function countBits(value: number) {
  let count = 0;
  let next = value;

  while (next > 0) {
    count += next & 1;
    next >>= 1;
  }

  return count;
}

function getTeamScore(players: TeamPlayer[]) {
  return players.reduce((sum, player) => {
    if (!player.tierId) return sum;
    return sum + TIER_SCORE[player.tierId];
  }, 0);
}

function buildTierBalancedTeams(players: TeamPlayer[]) {
  const totalScore = getTeamScore(players);
  let bestDiff = Number.POSITIVE_INFINITY;
  const candidates: { red: TeamPlayer[]; blue: TeamPlayer[]; redScore: number; blueScore: number; diff: number }[] = [];

  for (let mask = 0; mask < 1 << players.length; mask += 1) {
    if (countBits(mask) !== 5) continue;

    const red: TeamPlayer[] = [];
    const blue: TeamPlayer[] = [];

    players.forEach((player, index) => {
      if (mask & (1 << index)) red.push(player);
      else blue.push(player);
    });

    const redScore = getTeamScore(red);
    const blueScore = totalScore - redScore;
    const diff = Math.abs(redScore - blueScore);

    if (diff < bestDiff) {
      bestDiff = diff;
      candidates.length = 0;
    }

    if (diff === bestDiff) {
      candidates.push({ red, blue, redScore, blueScore, diff });
    }
  }

  const selected = pickRandom(candidates);

  return {
    mode: "tier",
    red: shuffleArray(selected.red),
    blue: shuffleArray(selected.blue),
    redScore: selected.redScore,
    blueScore: selected.blueScore,
    diff: selected.diff,
  } satisfies TeamResult;
}

function formatResult(result: TeamResult | null) {
  if (!result) return "";

  return `🔴 RED 팀\n${result.red.map((player) => player.name).join(" / ")}\n\n🔵 BLUE 팀\n${result.blue
    .map((player) => player.name)
    .join(" / ")}`;
}

function formatPlayerWithTier(player: TeamPlayer) {
  if (!player.tierId) return player.name;
  return `${player.name}(${TIER_LABEL[player.tierId]})`;
}

export default function PublicRandomTeamPage({ embedded = false }: { embedded?: boolean }) {
  const [rawText, setRawText] = useState("");
  const [mode, setMode] = useState<TeamMode>("random");
  const [tierBySlot, setTierBySlot] = useState<Record<number, TierId | "">>({});
  const [result, setResult] = useState<TeamResult | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const lastAutoShuffleKeyRef = useRef("");

  const names = useMemo(() => parseNames(rawText), [rawText]);
  const players = useMemo(() => toPlayers(names, tierBySlot), [names, tierBySlot]);
  const resultText = useMemo(() => formatResult(result), [result]);
  const selectedTierCount = players.filter((player) => Boolean(player.tierId)).length;
  const canShuffle = names.length === 10;
  const canTierShuffle = canShuffle && selectedTierCount === 10;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (names.length !== 10) {
        setResult(null);
        lastAutoShuffleKeyRef.current = "";
        return;
      }

      if (mode === "random") {
        const key = `random|${names.join("\u0000")}`;
        if (lastAutoShuffleKeyRef.current === key) return;

        setResult(shuffleNames(names));
        setCopyMessage("");
        lastAutoShuffleKeyRef.current = key;
        return;
      }

      if (!canTierShuffle) {
        setResult(null);
        lastAutoShuffleKeyRef.current = "";
        return;
      }

      const key = `tier|${players.map((player) => `${player.name}:${player.tierId}`).join("\u0000")}`;
      if (lastAutoShuffleKeyRef.current === key) return;

      setResult(buildTierBalancedTeams(players));
      setCopyMessage("");
      lastAutoShuffleKeyRef.current = key;
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [canTierShuffle, mode, names, players]);

  const statusText = (() => {
    if (names.length === 0) return "10명을 붙여넣으면 자동으로 팀이 나뉩니다.";
    if (names.length < 10) return `현재 ${names.length}명입니다. ${10 - names.length}명이 더 필요합니다.`;
    if (names.length > 10) return `현재 ${names.length}명입니다. 정확히 10명만 입력해야 합니다.`;
    if (mode === "tier" && selectedTierCount < 10) {
      return `10명 확인 완료. 티어 밸런스를 사용하려면 티어 ${10 - selectedTierCount}개를 더 선택해야 합니다.`;
    }
    if (mode === "tier") return "10명과 티어 확인 완료. 티어 점수 차이가 가장 작은 팀이 생성되었습니다.";
    return "10명 확인 완료. RED / BLUE 팀이 자동으로 생성되었습니다.";
  })();

  const handleModeChange = (nextMode: TeamMode) => {
    setMode(nextMode);
    setResult(null);
    setCopyMessage("");
    lastAutoShuffleKeyRef.current = "";
  };

  const handleShuffle = () => {
    if (mode === "random") {
      if (!canShuffle) return;
      setResult(shuffleNames(names));
    } else {
      if (!canTierShuffle) return;
      setResult(buildTierBalancedTeams(players));
    }

    setCopyMessage("");
  };

  const handleReset = () => {
    setRawText("");
    setResult(null);
    setCopyMessage("");
    setTierBySlot({});
    lastAutoShuffleKeyRef.current = "";
  };

  const handleTierReset = () => {
    setTierBySlot({});
    setResult(null);
    setCopyMessage("");
    lastAutoShuffleKeyRef.current = "";
  };

  const handleCopy = async () => {
    if (!resultText) return;

    try {
      await navigator.clipboard.writeText(resultText);
      setCopyMessage("복사 완료");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = resultText;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopyMessage("복사 완료");
    }
  };

  const Root = embedded ? "div" : "main";

  return (
    <Root
      className={embedded ? "random-team-tool random-team-tool--embedded" : "random-team-tool"}
      style={styles.page}
    >
      <section style={styles.hero}>
        <p style={styles.kicker}>K-LOL.GG 공개 도구</p>
        <h1 style={styles.title}>랜덤 팀 나누기</h1>
        <p style={styles.description}>
          10명의 이름을 붙여넣으면 RED 5명, BLUE 5명으로 즉시 분배됩니다. 순수 랜덤과
          현재 티어만 반영하는 간단 티어 밸런스를 선택할 수 있습니다.
        </p>
      </section>

      <section style={styles.modeCard}>
        <button
          type="button"
          onClick={() => handleModeChange("random")}
          style={mode === "random" ? styles.modeButtonActive : styles.modeButton}
        >
          순수 랜덤
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("tier")}
          style={mode === "tier" ? styles.modeButtonActive : styles.modeButton}
        >
          티어 밸런스
        </button>
        <p style={styles.modeHelp}>
          티어 밸런스는 아이언 1점부터 챌린저 10점까지 계산해 RED/BLUE 점수 차이가 가장 작은
          조합 중 하나를 랜덤으로 선택합니다.
        </p>
      </section>

      <section style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>이름 입력</h2>
              <p style={styles.cardSubText}>번호가 붙은 명단도 자동으로 이름만 인식합니다.</p>
            </div>
            <span style={names.length === 10 ? styles.countOk : styles.count}>{names.length}/10</span>
          </div>

          <textarea
            aria-label="팀을 나눌 참가자 명단"
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder={SAMPLE_TEXT}
            spellCheck={false}
            style={styles.textarea}
          />

          <p style={names.length === 10 && (mode === "random" || selectedTierCount === 10) ? styles.statusOk : styles.status}>
            {statusText}
          </p>

          <div style={styles.buttonRow}>
            <button
              type="button"
              onClick={handleShuffle}
              disabled={mode === "random" ? !canShuffle : !canTierShuffle}
              style={mode === "random" ? (canShuffle ? styles.primaryButton : styles.disabledButton) : canTierShuffle ? styles.primaryButton : styles.disabledButton}
            >
              {mode === "tier" ? "티어 밸런스 다시 섞기" : "다시 섞기"}
            </button>
            <button type="button" onClick={handleReset} style={styles.secondaryButton}>
              초기화
            </button>
          </div>

          <div style={styles.noticeBox}>
            <strong>기준</strong>
            <p style={styles.noticeText}>
              정확히 10명일 때만 실행됩니다. 같은 이름이 2번 있어도 서로 다른 인원으로 처리합니다.
              결과는 저장하지 않고, 복사해서 붙여넣는 용도로만 사용합니다.
            </p>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>팀 결과</h2>
              <p style={styles.cardSubText}>아래 형식 그대로 복사됩니다.</p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!resultText}
              style={resultText ? styles.copyButton : styles.disabledSmallButton}
            >
              결과 복사
            </button>
          </div>

          {result ? (
            <div style={styles.resultWrap}>
              {result.mode === "tier" ? (
                <div style={styles.scoreBox}>
                  <span>RED {result.redScore}점</span>
                  <span>BLUE {result.blueScore}점</span>
                  <span>차이 {result.diff}점</span>
                </div>
              ) : null}

              <section style={styles.teamBox}>
                <h3 style={styles.redTitle}>🔴 RED 팀</h3>
                <p style={styles.teamNames}>{result.red.map(formatPlayerWithTier).join(" / ")}</p>
              </section>

              <section style={styles.teamBox}>
                <h3 style={styles.blueTitle}>🔵 BLUE 팀</h3>
                <p style={styles.teamNames}>{result.blue.map(formatPlayerWithTier).join(" / ")}</p>
              </section>

              <details style={styles.copyPreviewDetails}>
                <summary style={styles.copyPreviewSummary}>복사 형식 미리보기</summary>
                <pre style={styles.copyPreview}>{resultText}</pre>
              </details>
              {copyMessage ? <p style={styles.copyMessage}>{copyMessage}</p> : null}
            </div>
          ) : (
            <div style={styles.emptyBox}>
              <p style={styles.emptyTitle}>아직 결과가 없습니다.</p>
              <p style={styles.emptyText}>
                {mode === "tier"
                  ? "10명을 입력하고 각 인원의 현재 티어를 선택하면 팀이 생성됩니다."
                  : "왼쪽 입력창에 10명을 붙여넣으면 자동으로 팀이 생성됩니다."}
              </p>
            </div>
          )}
        </div>
      </section>

      {mode === "tier" ? (
        <section style={styles.tierCard}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>현재 티어 선택</h2>
              <p style={styles.cardSubText}>입력된 이름 순서대로 현재 티어만 간단하게 선택합니다.</p>
            </div>
            <button type="button" onClick={handleTierReset} style={styles.secondaryButton}>
              티어 초기화
            </button>
          </div>

          {names.length === 0 ? (
            <div style={styles.emptyTierBox}>먼저 10명의 이름을 입력하세요.</div>
          ) : (
            <div style={styles.tierGrid}>
              {players.map((player, index) => (
                <label key={`${index}-${player.name}`} style={styles.tierRow}>
                  <span style={styles.playerIndex}>{index + 1}</span>
                  <span style={styles.playerName}>{player.name}</span>
                  <select
                    value={player.tierId || ""}
                    onChange={(event) => {
                      const nextValue = event.target.value as TierId | "";
                      setTierBySlot((prev) => ({ ...prev, [index]: nextValue }));
                      setCopyMessage("");
                      lastAutoShuffleKeyRef.current = "";
                    }}
                    style={styles.select}
                  >
                    <option value="">티어 선택</option>
                    {TIER_OPTIONS.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                        {tier.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </Root>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "32px 16px 56px",
    background: "transparent",
    color: "#f8fafc",
  },
  hero: {
    width: "min(1040px, 100%)",
    margin: "0 auto 20px",
  },
  kicker: {
    margin: "0 0 8px",
    color: "#94a3b8",
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.08em",
  },
  title: {
    margin: 0,
    fontSize: "clamp(30px, 5vw, 48px)",
    lineHeight: 1.1,
    letterSpacing: "-0.04em",
  },
  description: {
    maxWidth: "800px",
    margin: "14px 0 0",
    color: "#cbd5e1",
    fontSize: "15px",
    lineHeight: 1.7,
  },
  modeCard: {
    width: "min(1040px, 100%)",
    margin: "0 auto 16px",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    borderRadius: "20px",
    background: "rgba(15, 23, 42, 0.74)",
    padding: "14px",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
  },
  modeButton: {
    border: "1px solid rgba(148, 163, 184, 0.28)",
    borderRadius: "999px",
    background: "rgba(15, 23, 42, 0.72)",
    color: "#cbd5e1",
    padding: "10px 15px",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  modeButtonActive: {
    border: "1px solid rgba(248, 250, 252, 0.9)",
    borderRadius: "999px",
    background: "#f8fafc",
    color: "#020617",
    padding: "10px 15px",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  modeHelp: {
    flex: "1 1 360px",
    margin: 0,
    color: "#94a3b8",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  grid: {
    width: "min(1040px, 100%)",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "16px",
  },
  card: {
    border: "1px solid rgba(148, 163, 184, 0.22)",
    borderRadius: "22px",
    background: "rgba(15, 23, 42, 0.84)",
    boxShadow: "0 20px 80px rgba(0, 0, 0, 0.28)",
    padding: "20px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "14px",
  },
  cardTitle: {
    margin: 0,
    fontSize: "20px",
    letterSpacing: "-0.02em",
  },
  cardSubText: {
    margin: "6px 0 0",
    color: "#94a3b8",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  count: {
    flexShrink: 0,
    borderRadius: "999px",
    padding: "7px 11px",
    background: "rgba(148, 163, 184, 0.13)",
    color: "#cbd5e1",
    fontSize: "13px",
    fontWeight: 800,
  },
  countOk: {
    flexShrink: 0,
    borderRadius: "999px",
    padding: "7px 11px",
    background: "rgba(34, 197, 94, 0.16)",
    color: "#86efac",
    fontSize: "13px",
    fontWeight: 800,
  },
  textarea: {
    width: "100%",
    minHeight: "300px",
    resize: "vertical",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: "16px",
    background: "rgba(2, 6, 23, 0.74)",
    color: "#f8fafc",
    padding: "16px",
    fontSize: "16px",
    lineHeight: 1.75,
    outline: "none",
  },
  status: {
    margin: "12px 0 0",
    color: "#fbbf24",
    fontSize: "14px",
    lineHeight: 1.5,
  },
  statusOk: {
    margin: "12px 0 0",
    color: "#86efac",
    fontSize: "14px",
    lineHeight: 1.5,
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "16px",
  },
  primaryButton: {
    border: 0,
    borderRadius: "14px",
    background: "#f8fafc",
    color: "#020617",
    padding: "12px 16px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid rgba(148, 163, 184, 0.28)",
    borderRadius: "14px",
    background: "rgba(15, 23, 42, 0.72)",
    color: "#e2e8f0",
    padding: "12px 16px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  disabledButton: {
    border: 0,
    borderRadius: "14px",
    background: "rgba(148, 163, 184, 0.16)",
    color: "#64748b",
    padding: "12px 16px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "not-allowed",
  },
  copyButton: {
    flexShrink: 0,
    border: 0,
    borderRadius: "13px",
    background: "#38bdf8",
    color: "#082f49",
    padding: "10px 13px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  disabledSmallButton: {
    flexShrink: 0,
    border: 0,
    borderRadius: "13px",
    background: "rgba(148, 163, 184, 0.16)",
    color: "#64748b",
    padding: "10px 13px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "not-allowed",
  },
  noticeBox: {
    marginTop: "16px",
    borderRadius: "16px",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    background: "rgba(2, 6, 23, 0.46)",
    padding: "13px 14px",
    color: "#e2e8f0",
    fontSize: "13px",
  },
  noticeText: {
    margin: "6px 0 0",
    color: "#94a3b8",
    lineHeight: 1.6,
  },
  resultWrap: {
    display: "grid",
    gap: "12px",
  },
  scoreBox: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    color: "#cbd5e1",
    fontSize: "13px",
    fontWeight: 900,
  },
  teamBox: {
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "18px",
    background: "rgba(2, 6, 23, 0.55)",
    padding: "16px",
  },
  redTitle: {
    margin: "0 0 10px",
    color: "#fecaca",
    fontSize: "18px",
  },
  blueTitle: {
    margin: "0 0 10px",
    color: "#bae6fd",
    fontSize: "18px",
  },
  teamNames: {
    margin: 0,
    color: "#f8fafc",
    fontSize: "18px",
    lineHeight: 1.7,
    fontWeight: 800,
    wordBreak: "keep-all",
  },
  copyPreviewDetails: {
    margin: 0,
    borderRadius: "16px",
    border: "1px dashed rgba(148, 163, 184, 0.32)",
    background: "rgba(2, 6, 23, 0.68)",
    padding: "13px 16px",
  },
  copyPreviewSummary: {
    color: "#cbd5e1",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 800,
  },
  copyPreview: {
    margin: "12px 0 0",
    borderTop: "1px solid rgba(148, 163, 184, 0.2)",
    color: "#e2e8f0",
    padding: "12px 0 0",
    whiteSpace: "pre-wrap",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "15px",
    lineHeight: 1.7,
  },
  copyMessage: {
    margin: 0,
    color: "#86efac",
    fontSize: "14px",
    fontWeight: 800,
  },
  emptyBox: {
    minHeight: "320px",
    border: "1px dashed rgba(148, 163, 184, 0.28)",
    borderRadius: "18px",
    display: "grid",
    placeContent: "center",
    textAlign: "center",
    padding: "24px",
    background: "rgba(2, 6, 23, 0.4)",
  },
  emptyTitle: {
    margin: 0,
    color: "#e2e8f0",
    fontSize: "18px",
    fontWeight: 800,
  },
  emptyText: {
    maxWidth: "320px",
    margin: "8px auto 0",
    color: "#94a3b8",
    fontSize: "14px",
    lineHeight: 1.6,
  },
  tierCard: {
    width: "min(1040px, 100%)",
    margin: "16px auto 0",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    borderRadius: "22px",
    background: "rgba(15, 23, 42, 0.84)",
    boxShadow: "0 20px 80px rgba(0, 0, 0, 0.28)",
    padding: "20px",
  },
  tierGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "10px",
  },
  tierRow: {
    display: "grid",
    gridTemplateColumns: "34px minmax(80px, 1fr) 150px",
    alignItems: "center",
    gap: "10px",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "14px",
    background: "rgba(2, 6, 23, 0.44)",
    padding: "10px",
  },
  playerIndex: {
    width: "28px",
    height: "28px",
    borderRadius: "999px",
    display: "grid",
    placeItems: "center",
    background: "rgba(148, 163, 184, 0.16)",
    color: "#cbd5e1",
    fontSize: "12px",
    fontWeight: 900,
  },
  playerName: {
    color: "#f8fafc",
    fontSize: "14px",
    fontWeight: 900,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  select: {
    width: "100%",
    border: "1px solid rgba(148, 163, 184, 0.28)",
    borderRadius: "12px",
    background: "#020617",
    color: "#f8fafc",
    padding: "9px 10px",
    fontSize: "13px",
    fontWeight: 800,
    outline: "none",
  },
  emptyTierBox: {
    border: "1px dashed rgba(148, 163, 184, 0.28)",
    borderRadius: "16px",
    padding: "24px",
    color: "#94a3b8",
    textAlign: "center",
    background: "rgba(2, 6, 23, 0.4)",
  },
};

