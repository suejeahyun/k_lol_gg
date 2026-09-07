import { uniformRandomIndex, type Uint32Source } from "./random-source";

export type CoinSide = "FRONT" | "BACK";

export type IdleCoinTossState = Readonly<{ phase: "idle"; round: number; outcome: null }>;
export type PlayingCoinTossState = Readonly<{
  phase: "playing";
  round: number;
  outcome: CoinSide;
}>;
export type RevealedCoinTossState = Readonly<{
  phase: "revealed";
  round: number;
  outcome: CoinSide;
}>;
export type CoinTossState = IdleCoinTossState | PlayingCoinTossState | RevealedCoinTossState;

export type CoinTossEvent =
  | Readonly<{ type: "START"; outcome: CoinSide }>
  | Readonly<{ type: "REVEAL" }>
  | Readonly<{ type: "RESET" }>;

export class CoinTossTransitionError extends Error {
  constructor(readonly code: "TOSS_IN_PROGRESS" | "NOT_PLAYING" | "INVALID_OUTCOME") {
    super(code);
    this.name = "CoinTossTransitionError";
  }
}

export const INITIAL_COIN_TOSS_STATE: IdleCoinTossState = Object.freeze({
  phase: "idle",
  round: 0,
  outcome: null,
});

export function chooseCoinSide(source: Uint32Source): CoinSide {
  return uniformRandomIndex(2, source) === 0 ? "FRONT" : "BACK";
}

export function transitionCoinToss(
  state: CoinTossState,
  event: Extract<CoinTossEvent, { type: "START" }>,
): PlayingCoinTossState;
export function transitionCoinToss(
  state: CoinTossState,
  event: Extract<CoinTossEvent, { type: "REVEAL" }>,
): RevealedCoinTossState;
export function transitionCoinToss(
  state: CoinTossState,
  event: Extract<CoinTossEvent, { type: "RESET" }>,
): IdleCoinTossState;
export function transitionCoinToss(
  state: CoinTossState,
  event: CoinTossEvent,
): CoinTossState {
  if (event.type === "RESET") {
    return { phase: "idle", round: state.round, outcome: null };
  }

  if (event.type === "START") {
    if (state.phase === "playing") throw new CoinTossTransitionError("TOSS_IN_PROGRESS");
    if (event.outcome !== "FRONT" && event.outcome !== "BACK") {
      throw new CoinTossTransitionError("INVALID_OUTCOME");
    }

    return { phase: "playing", round: state.round + 1, outcome: event.outcome };
  }

  if (state.phase !== "playing") throw new CoinTossTransitionError("NOT_PLAYING");
  return { phase: "revealed", round: state.round, outcome: state.outcome };
}

export function beginCoinToss(
  state: CoinTossState,
  source: Uint32Source,
): PlayingCoinTossState {
  return transitionCoinToss(state, { type: "START", outcome: chooseCoinSide(source) });
}

export function revealCoinToss(state: CoinTossState): RevealedCoinTossState {
  return transitionCoinToss(state, { type: "REVEAL" });
}
