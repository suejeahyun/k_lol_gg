"use client";

import { Clipboard, Coins, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import {
  beginCoinToss,
  INITIAL_COIN_TOSS_STATE,
  revealCoinToss,
  transitionCoinToss,
  type CoinTossState,
} from "@/modules/team-tools";

import styles from "../team-tools.module.css";

const FALLBACK_REVEAL_MS = 1_600;

function browserUint32() {
  const value = new Uint32Array(1);
  window.crypto.getRandomValues(value);
  return value[0]!;
}

function sideLabel(state: CoinTossState) {
  if (state.phase !== "revealed") return null;
  return state.outcome === "FRONT" ? "앞면" : "뒷면";
}

export function CoinTossTool() {
  const [state, setState] = useState<CoinTossState>(INITIAL_COIN_TOSS_STATE);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (state.phase !== "playing") return;
    const fallback = window.setTimeout(() => {
      setState((current) => current.phase === "playing" ? revealCoinToss(current) : current);
    }, FALLBACK_REVEAL_MS);
    return () => window.clearTimeout(fallback);
  }, [state.phase, state.round]);

  function reveal() {
    setState((current) => current.phase === "playing" ? revealCoinToss(current) : current);
  }

  function start() {
    if (state.phase === "playing") return;
    setError(null);
    setCopyStatus("");
    try {
      setState(beginCoinToss(state, browserUint32));
    } catch {
      setError("코인을 던지지 못했어요. 브라우저를 새로고침한 뒤 다시 시도해 주세요.");
    }
  }

  function reset() {
    setState((current) => transitionCoinToss(current, { type: "RESET" }));
    setError(null);
    setCopyStatus("");
  }

  async function copyResult() {
    const label = sideLabel(state);
    if (!label) return;
    try {
      await navigator.clipboard.writeText(`코인 토스 ${state.round}회: ${label}`);
      setCopyStatus(`${label} 결과를 클립보드에 복사했어요.`);
    } catch {
      setCopyStatus("복사하지 못했어요. 결과를 직접 선택해 복사해 주세요.");
    }
  }

  const label = sideLabel(state);
  const phaseCopy = state.phase === "idle"
    ? { kicker: "READY", title: "어느 면이 나올까요?", body: "코인 던지기를 눌러 시작해요." }
    : state.phase === "playing"
      ? { kicker: `ROUND ${state.round}`, title: "살랑살랑 날아가는 중", body: "잠시만 기다려 주세요." }
      : { kicker: `ROUND ${state.round} RESULT`, title: `${label}!`, body: "결과가 정해졌어요. 한 번 더 던질 수도 있어요." };

  return (
    <div className={styles.coinLayout}>
      <section className={styles.panel} aria-labelledby="coin-controls-title">
        <div className={styles.heading}>
          <div><span>CONTROLS</span><h2 id="coin-controls-title">코인 던지기</h2></div>
          <strong className={styles.count}>{state.round}회</strong>
        </div>
        <p className={styles.stageHint}>매번 브라우저의 보안 난수로 앞면 또는 뒷면을 고릅니다. 애니메이션이 멈춰도 2초 안에 결과를 자동 공개해요.</p>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.actions}>
          <button className={styles.primaryButton} type="button" onClick={start} disabled={state.phase === "playing"}>
            <Coins size={18} aria-hidden="true" /> {state.phase === "revealed" ? "한 번 더 던지기" : "코인 던지기"}
          </button>
          <button className={styles.secondaryButton} type="button" onClick={reset} disabled={state.phase === "idle"}>
            <RotateCcw size={17} aria-hidden="true" /> 초기화
          </button>
          <button className={styles.secondaryButton} type="button" onClick={copyResult} disabled={state.phase !== "revealed"}>
            <Clipboard size={17} aria-hidden="true" /> 결과 복사
          </button>
        </div>
        <p className={styles.fieldHint} role="status" aria-live="polite">{copyStatus}</p>
      </section>

      <section className={styles.coinStage} aria-labelledby="coin-result-title">
        <div
          className={styles.coin}
          data-phase={state.phase}
          data-side={state.phase === "revealed" ? state.outcome : undefined}
          onAnimationEnd={reveal}
          aria-hidden="true"
        >
          {state.phase === "revealed" && state.outcome === "BACK" ? <Sparkles /> : <Coins />}
        </div>
        <div className={styles.coinText} role="status" aria-live="polite" aria-atomic="true">
          <span>{phaseCopy.kicker}</span>
          <h2 id="coin-result-title">{phaseCopy.title}</h2>
          <p>{phaseCopy.body}</p>
        </div>
      </section>
    </div>
  );
}
