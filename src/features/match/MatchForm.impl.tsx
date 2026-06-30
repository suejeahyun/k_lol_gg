"use client";

import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import { useRouter } from "next/navigation";
import { getMatchDateTimeLocalFromTitle } from "@/lib/date/kst";
import type {
  LolChampionCandidate,
  LolResultImportResponse,
  LolResultImportRow,
} from "@/features/match/lol-result-import-types";
import { extractRiotNameFromPlayerLabel, nicknameSimilarity, participantNameSimilarity } from "@/features/match/lol-result-import-utils";

type Team = "BLUE" | "RED";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type SeasonOption = {
  id: number;
  name: string;
};

type PlayerOption = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
};

type ChampionOption = {
  id: number;
  name: string;
};

type TeamBalanceDraftPlayer = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier: string | null;
  peakTier: string | null;
  position: Position;
};

type TeamBalanceDraftDetailResponse = {
  message?: string;
  id?: number;
  title?: string;
  applyDate?: string;
  teams?: {
    BLUE?: TeamBalanceDraftPlayer[];
    RED?: TeamBalanceDraftPlayer[];
  };
};

type TeamBalanceDraftListItem = {
  id: number;
  title: string;
  label: string;
  applyDate: string;
  count: number;
};

type TeamBalanceDraftListResponse = {
  message?: string;
  drafts?: TeamBalanceDraftListItem[];
};

type ParticipantForm = {
  playerId: number;
  playerInput: string;
  championId: number;
  championInput: string;
  team: Team;
  position: Position;
  kills: number;
  deaths: number;
  assists: number;
};

type GameForm = {
  gameNumber: number;
  winnerTeam: Team;
  participants: ParticipantForm[];
};

type MatchFormData = {
  id?: number;
  seasonId: number;
  title: string;
  matchDate: string;
  teamBalanceDraftId?: number | null;
  games: GameForm[];
};

type MatchFormProps = {
  mode: "create" | "edit";
  submitUrl: string;
  initialData: MatchFormData;
  seasons: SeasonOption[];
  players: PlayerOption[];
  champions: ChampionOption[];
};

function makePlayerLabel(player: PlayerOption) {
  return `${player.name}(${player.nickname}#${player.tag})`;
}

function createEmptyParticipants(): ParticipantForm[] {
  return [
    {
      playerId: 0,
      playerInput: "",
      championId: 0,
      championInput: "",
      team: "BLUE",
      position: "TOP",
      kills: 0,
      deaths: 0,
      assists: 0,
    },
    {
      playerId: 0,
      playerInput: "",
      championId: 0,
      championInput: "",
      team: "BLUE",
      position: "JGL",
      kills: 0,
      deaths: 0,
      assists: 0,
    },
    {
      playerId: 0,
      playerInput: "",
      championId: 0,
      championInput: "",
      team: "BLUE",
      position: "MID",
      kills: 0,
      deaths: 0,
      assists: 0,
    },
    {
      playerId: 0,
      playerInput: "",
      championId: 0,
      championInput: "",
      team: "BLUE",
      position: "ADC",
      kills: 0,
      deaths: 0,
      assists: 0,
    },
    {
      playerId: 0,
      playerInput: "",
      championId: 0,
      championInput: "",
      team: "BLUE",
      position: "SUP",
      kills: 0,
      deaths: 0,
      assists: 0,
    },
    {
      playerId: 0,
      playerInput: "",
      championId: 0,
      championInput: "",
      team: "RED",
      position: "TOP",
      kills: 0,
      deaths: 0,
      assists: 0,
    },
    {
      playerId: 0,
      playerInput: "",
      championId: 0,
      championInput: "",
      team: "RED",
      position: "JGL",
      kills: 0,
      deaths: 0,
      assists: 0,
    },
    {
      playerId: 0,
      playerInput: "",
      championId: 0,
      championInput: "",
      team: "RED",
      position: "MID",
      kills: 0,
      deaths: 0,
      assists: 0,
    },
    {
      playerId: 0,
      playerInput: "",
      championId: 0,
      championInput: "",
      team: "RED",
      position: "ADC",
      kills: 0,
      deaths: 0,
      assists: 0,
    },
    {
      playerId: 0,
      playerInput: "",
      championId: 0,
      championInput: "",
      team: "RED",
      position: "SUP",
      kills: 0,
      deaths: 0,
      assists: 0,
    },
  ];
}

function createEmptyGame(nextGameNumber: number): GameForm {
  return {
    gameNumber: nextGameNumber,
    winnerTeam: "BLUE",
    participants: createEmptyParticipants(),
  };
}

function cloneParticipantsFromPreviousGame(
  previousParticipants: ParticipantForm[]
): ParticipantForm[] {
  return previousParticipants.map((participant) => ({
    playerId: participant.playerId,
    playerInput: participant.playerInput,
    championId: 0,
    championInput: "",
    team: participant.team,
    position: participant.position,
    kills: 0,
    deaths: 0,
    assists: 0,
  }));
}

function parseNonNegativeInt(value: string) {
  if (value.trim() === "") {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function normalizeWinnerTeam(value: unknown): Team {
  return value === "RED" ? "RED" : "BLUE";
}

async function parseResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("응답 JSON 파싱 실패:", error, text);
    return null;
  }
}

export default function MatchForm({
  mode,
  submitUrl,
  initialData,
  seasons,
  players,
  champions,
}: MatchFormProps) {
  const router = useRouter();

  const championMap = useMemo(() => {
    const map = new Map<string, number>();
    champions.forEach((champion) => {
      map.set(champion.name.trim().toLowerCase(), champion.id);
    });
    return map;
  }, [champions]);

  const playerIdToLabel = useMemo(() => {
    const map = new Map<number, string>();
    players.forEach((player) => {
      map.set(player.id, makePlayerLabel(player));
    });
    return map;
  }, [players]);

  const championIdToLabel = useMemo(() => {
    const map = new Map<number, string>();
    champions.forEach((champion) => {
      map.set(champion.id, champion.name);
    });
    return map;
  }, [champions]);

  const normalizedInitialData = useMemo<MatchFormData>(() => {
    return {
      ...initialData,
      games:
        initialData.games.length > 0
          ? initialData.games.map((game) => ({
              ...game,
              winnerTeam: normalizeWinnerTeam(game.winnerTeam),
              participants: game.participants.map((participant) => ({
                ...participant,
                playerInput:
                  participant.playerInput ||
                  playerIdToLabel.get(participant.playerId) ||
                  "",
                championInput:
                  participant.championInput ||
                  championIdToLabel.get(participant.championId) ||
                  "",
              })),
            }))
          : [],
    };
  }, [initialData, playerIdToLabel, championIdToLabel]);

  const [form, setForm] = useState<MatchFormData>(normalizedInitialData);
  const [submitting, setSubmitting] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [draftListLoading, setDraftListLoading] = useState(false);
  const [teamBalanceDrafts, setTeamBalanceDrafts] = useState<TeamBalanceDraftListItem[]>([]);
  const [selectedTeamBalanceDraftId, setSelectedTeamBalanceDraftId] = useState(initialData.teamBalanceDraftId ? String(initialData.teamBalanceDraftId) : "");
  const [activePlayerField, setActivePlayerField] = useState<string | null>(null);
  const [activeChampionField, setActiveChampionField] = useState<string | null>(
    null
  );
  const [lolResultImportingGameIndex, setLolResultImportingGameIndex] = useState<number | null>(null);
  const [lolResultImportStatus, setLolResultImportStatus] = useState<Record<number, string>>({});
  const [lolChampionCandidates, setLolChampionCandidates] = useState<Record<string, LolChampionCandidate[]>>({});
  const [lolChampionPreviews, setLolChampionPreviews] = useState<Record<string, string>>({});

  const loadTeamBalanceDrafts = async () => {
    try {
      setDraftListLoading(true);

      const response = await fetch("/api/team-balance/drafts", {
        cache: "no-store",
      });

      const data = await parseResponse<TeamBalanceDraftListResponse>(response);

      if (!response.ok) {
        console.error("[TEAM_BALANCE_DRAFTS_GET_ERROR]", data?.message);
        setTeamBalanceDrafts([]);
        setSelectedTeamBalanceDraftId("");
        return [];
      }

      const drafts = data?.drafts ?? [];
      setTeamBalanceDrafts(drafts);
      const queryDraftId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("teamBalanceDraftId") ?? ""
          : "";

      setSelectedTeamBalanceDraftId((prev) => {
        if (prev && drafts.some((draft) => String(draft.id) === prev)) {
          return prev;
        }

        if (queryDraftId && drafts.some((draft) => String(draft.id) === queryDraftId)) {
          return queryDraftId;
        }

        return drafts[0]?.id ? String(drafts[0].id) : "";
      });

      return drafts;
    } catch (error: unknown) {
      console.error("[LOAD_TEAM_BALANCE_DRAFTS_ERROR]", error);
      setTeamBalanceDrafts([]);
      setSelectedTeamBalanceDraftId("");
      return [];
    } finally {
      setDraftListLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== "create") return;

    void loadTeamBalanceDrafts();
  }, [mode]);

  const updateParticipantField = <K extends keyof ParticipantForm>(
    gameIndex: number,
    participantIndex: number,
    field: K,
    value: ParticipantForm[K]
  ) => {
    setForm((prev) => {
      const nextGames = [...prev.games];
      const nextParticipants = [...nextGames[gameIndex].participants];

      nextParticipants[participantIndex] = {
        ...nextParticipants[participantIndex],
        [field]: value,
      };

      nextGames[gameIndex] = {
        ...nextGames[gameIndex],
        participants: nextParticipants,
      };

      return {
        ...prev,
        games: nextGames,
      };
    });
  };

  const updateGameWinnerTeam = (gameIndex: number, winnerTeam: Team) => {
    setForm((prev) => {
      const nextGames = [...prev.games];

      nextGames[gameIndex] = {
        ...nextGames[gameIndex],
        winnerTeam,
      };

      return {
        ...prev,
        games: nextGames,
      };
    });
  };

  const addGame = () => {
    setForm((prev) => {
      const nextGameNumber = prev.games.length + 1;
      const lastGame = prev.games[prev.games.length - 1];

      const nextGame: GameForm = lastGame
        ? {
            gameNumber: nextGameNumber,
            winnerTeam: lastGame.winnerTeam,
            participants: cloneParticipantsFromPreviousGame(
              lastGame.participants
            ),
          }
        : createEmptyGame(nextGameNumber);

      return {
        ...prev,
        games: [...prev.games, nextGame],
      };
    });
  };

  const removeGame = (gameIndex: number) => {
    setForm((prev) => {
      const filtered = prev.games.filter((_, index) => index !== gameIndex);
      const reNumbered = filtered.map((game, index) => ({
        ...game,
        gameNumber: index + 1,
      }));

      return {
        ...prev,
        games: reNumbered,
      };
    });
  };

  const buildPayload = () => {
    return {
      id: form.id,
      seasonId: form.seasonId,
      title: form.title.trim(),
      matchDate: getMatchDateTimeLocalFromTitle(form.title, form.matchDate ? new Date(form.matchDate) : new Date()),
      teamBalanceDraftId:
        Number.isInteger(Number(selectedTeamBalanceDraftId)) && Number(selectedTeamBalanceDraftId) > 0
          ? Number(selectedTeamBalanceDraftId)
          : null,
      games: form.games.map((game) => ({
        gameNumber: game.gameNumber,
        winnerTeam: game.winnerTeam,
        participants: game.participants.map((participant) => ({
          playerId: participant.playerId,
          championId: participant.championId,
          team: participant.team,
          position: participant.position,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
        })),
      })),
    };
  };

  const runClientValidation = () => {
    if (!form.title.trim()) {
      return "내전 제목을 입력해주세요.";
    }

    if (!Number.isInteger(form.seasonId) || form.seasonId <= 0) {
      return "시즌을 선택해주세요.";
    }


    if (form.games.length === 0) {
      return "최소 1세트 이상 추가해주세요.";
    }

    for (const game of form.games) {
      const gameLabel = `${game.gameNumber}세트`;

      if (!["BLUE", "RED"].includes(game.winnerTeam)) {
        return `${gameLabel} 승리팀을 선택해주세요.`;
      }

      if (game.participants.length !== 10) {
        return `${gameLabel} 참가자는 정확히 10명이어야 합니다.`;
      }

      const blueCount = game.participants.filter(
        (participant) => participant.team === "BLUE"
      ).length;
      const redCount = game.participants.filter(
        (participant) => participant.team === "RED"
      ).length;

      if (blueCount !== 5 || redCount !== 5) {
        return `${gameLabel}는 블루 5명, 레드 5명이어야 합니다.`;
      }

      const playerIds = game.participants.map((participant) => participant.playerId);
      if (playerIds.some((id) => !id)) {
        return `${gameLabel}에 등록되지 않은 플레이어가 있습니다.`;
      }

      if (new Set(playerIds).size !== playerIds.length) {
        return `${gameLabel}에 중복된 플레이어가 있습니다.`;
      }

      const championIds = game.participants.map(
        (participant) => participant.championId
      );
      if (championIds.some((id) => !id)) {
        return `${gameLabel}에 등록되지 않은 챔피언이 있습니다.`;
      }

      if (new Set(championIds).size !== championIds.length) {
        return `${gameLabel}에 중복된 챔피언이 있습니다.`;
      }

      const bluePositions = new Set(
        game.participants
          .filter((participant) => participant.team === "BLUE")
          .map((participant) => participant.position)
      );

      const redPositions = new Set(
        game.participants
          .filter((participant) => participant.team === "RED")
          .map((participant) => participant.position)
      );

      if (bluePositions.size !== 5) {
        return `${gameLabel} 블루팀 포지션이 중복되었습니다.`;
      }

      if (redPositions.size !== 5) {
        return `${gameLabel} 레드팀 포지션이 중복되었습니다.`;
      }

      for (const participant of game.participants) {
        if (!Number.isInteger(participant.kills) || participant.kills < 0) {
          return `${gameLabel} 킬은 0 이상의 정수만 입력할 수 있습니다.`;
        }

        if (!Number.isInteger(participant.deaths) || participant.deaths < 0) {
          return `${gameLabel} 데스는 0 이상의 정수만 입력할 수 있습니다.`;
        }

        if (!Number.isInteger(participant.assists) || participant.assists < 0) {
          return `${gameLabel} 어시스트는 0 이상의 정수만 입력할 수 있습니다.`;
        }
      }
    }

    return null;
  };


  const applyTeamBalanceToParticipants = (
    participants: ParticipantForm[],
    bluePlayers: TeamBalanceDraftPlayer[],
    redPlayers: TeamBalanceDraftPlayer[]
  ): ParticipantForm[] => {
    const draftPlayers = [...bluePlayers, ...redPlayers];

    return participants.map((participant, index) => {
      const draftPlayer = draftPlayers[index];

      if (!draftPlayer) {
        return {
          ...participant,
          playerId: 0,
          playerInput: "",
        };
      }

      return {
        ...participant,
        playerId: draftPlayer.playerId,
        playerInput: makePlayerLabel({
          id: draftPlayer.playerId,
          name: draftPlayer.name,
          nickname: draftPlayer.nickname,
          tag: draftPlayer.tag,
        }),
        team: index < bluePlayers.length ? "BLUE" : "RED",
        position: draftPlayer.position,
      };
    });
  };

  const handleImportTeamBalance = async () => {
    try {
      const drafts =
        teamBalanceDrafts.length > 0
          ? teamBalanceDrafts
          : await loadTeamBalanceDrafts();

      const targetDraftId =
        selectedTeamBalanceDraftId ||
        (drafts[0]?.id ? String(drafts[0].id) : "");

      if (!targetDraftId || Number.isNaN(Number(targetDraftId))) {
        alert("팀 밸런스 결과를 선택해주세요.");
        return;
      }

      const ok = confirm("선택한 팀 밸런스 결과를 가져오시겠습니까?");
      if (!ok) return;

      setImportLoading(true);

      const response = await fetch(
        `/api/team-balance/drafts/${encodeURIComponent(targetDraftId)}`,
        {
          cache: "no-store",
        }
      );

      const data = await parseResponse<TeamBalanceDraftDetailResponse>(response);

      if (!response.ok) {
        alert(data?.message ?? "팀 밸런스 결과 불러오기에 실패했습니다.");
        return;
      }

      const bluePlayers = data?.teams?.BLUE ?? [];
      const redPlayers = data?.teams?.RED ?? [];
      const totalCount = bluePlayers.length + redPlayers.length;

      if (totalCount === 0) {
        alert("저장된 팀 밸런스 참가자가 없습니다.");
        return;
      }

      if (totalCount !== 10) {
        alert("팀 밸런스 참가자는 현재 " + totalCount + "명입니다. 10명 기준으로 불러옵니다.");
      }

      setSelectedTeamBalanceDraftId(targetDraftId);

      setForm((prev) => {
        const baseGames =
          prev.games.length > 0 ? prev.games : [createEmptyGame(1)];

        return {
          ...prev,
          games: baseGames.map((game) => ({
            ...game,
            participants: applyTeamBalanceToParticipants(
              game.participants,
              bluePlayers,
              redPlayers
            ),
          })),
        };
      });

      alert("팀 밸런스 결과를 불러왔습니다.");
    } catch (error: unknown) {
      console.error("[IMPORT_TEAM_BALANCE_ERROR]", error);
      alert("팀 밸런스 결과 불러오기 중 오류가 발생했습니다.");
    } finally {
      setImportLoading(false);
    }
  };

  const normalizeMatchToken = (value: string) =>
    value
      .replace(/\([^)]*\)/g, " ")
      .replace(/#[^#\s)]+/g, " ")
      .replace(/\.\.\.|…/g, " ")
      .replace(/[£¥₩]/g, " ")
      .replace(/[|｜ㅣ]/g, " ")
      .replace(/[^0-9A-Za-z가-힣]/g, "")
      .toLowerCase()
      .trim();

  const normalizeRiotToken = (value: string) =>
    value
      .replace(/\.\.\.|…/g, "")
      .replace(/[£¥₩<>()[\]{}|｜ㅣ"'`~!@#$%^&*_+=:;,.?/\\-]/g, " ")
      .replace(/\b(kr|kr1|kr20|reg|rcn|rta|nid|sid|ary|ory|ow|of|eo|zn|sz|en|ln|ar|ah|ak|ai|he|asr|aber|ase|boc|rla|ms|wa|wia|sag|sol|re|rta|weds|rars|wn|an|st)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[^0-9A-Za-z가-힣]/g, "")
      .toLowerCase();

  const compactToken = (value: string) => normalizeRiotToken(value).replace(/\s+/g, "");

  const getParticipantAliases = (participantLabel: string) => {
    const aliases = new Set<string>();
    const addAlias = (raw: string | null | undefined) => {
      if (!raw) return;

      const base = raw.trim();
      const withoutTag = base.replace(/#[^#\s)]+/g, "").trim();
      const beforeTag = base.split("#")[0]?.trim() ?? "";
      const insideParentheses = Array.from(base.matchAll(/\(([^)]*)\)/g)).map((match) => match[1] ?? "");

      for (const candidate of [base, withoutTag, beforeTag, ...insideParentheses]) {
        const normalized = compactToken(candidate);
        if (normalized.length >= 2) aliases.add(normalized);
      }
    };

    addAlias(participantLabel);
    addAlias(participantLabel.replace(/\([^)]*\)/g, " "));

    Array.from(participantLabel.matchAll(/\(([^)]*)\)/g)).forEach((match) => {
      const riotText = match[1] ?? "";
      addAlias(riotText);
      addAlias(riotText.split("#")[0]);
    });

    participantLabel
      .split(/[\s/·,()#]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .forEach(addAlias);

    return Array.from(aliases);
  };

  const longestCommonSubstringLength = (left: string, right: string) => {
    if (!left || !right) return 0;

    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;
    let longest = 0;

    for (let start = 0; start < shorter.length; start += 1) {
      for (let end = start + 2; end <= shorter.length; end += 1) {
        const part = shorter.slice(start, end);
        if (longer.includes(part)) longest = Math.max(longest, part.length);
      }
    }

    return longest;
  };

  const levenshteinDistance = (left: string, right: string) => {
    if (left === right) return 0;
    if (!left) return right.length;
    if (!right) return left.length;

    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = Array.from({ length: right.length + 1 }, () => 0);

    for (let i = 1; i <= left.length; i += 1) {
      current[0] = i;
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        current[j] = Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + cost
        );
      }
      previous.splice(0, previous.length, ...current);
    }

    return previous[right.length];
  };

  const simpleMatchScore = (ocrName: string, participantLabel: string) => {
    const rawOcr = compactToken(ocrName);
    if (!rawOcr) return 0;

    const aliases = getParticipantAliases(participantLabel);
    let best = 0;

    for (const alias of aliases) {
      if (!alias) continue;
      if (rawOcr === alias) return 1;

      if (rawOcr.includes(alias)) {
        best = Math.max(best, Math.min(0.99, alias.length / Math.max(1, rawOcr.length) + 0.35));
      }

      if (alias.includes(rawOcr)) {
        best = Math.max(best, Math.min(0.97, rawOcr.length / Math.max(1, alias.length) + 0.32));
      }

      const longest = longestCommonSubstringLength(rawOcr, alias);
      if (longest >= 3) {
        best = Math.max(best, Math.min(0.96, longest / Math.max(rawOcr.length, alias.length) + 0.35));
      }

      const distance = levenshteinDistance(rawOcr, alias);
      const maxLength = Math.max(rawOcr.length, alias.length);
      const similarity = maxLength > 0 ? 1 - distance / maxLength : 0;
      if (similarity >= 0.55) {
        best = Math.max(best, similarity);
      }

      // 한글 OCR이 1글자만 남는 경우는 순서 fallback을 우선하게 한다.
      if (rawOcr.length <= 1 || alias.length <= 1) {
        best = Math.min(best, 0.12);
      }
    }

    return best;
  };

  const getBestParticipantMatch = (
    participants: ParticipantForm[],
    playerName: string,
    usedIndexes: Set<number>,
    team?: Team | null
  ): { index: number; score: number } | null => {
    let bestMatch: { index: number; score: number } | null = null;

    participants.forEach((participant, index) => {
      if (usedIndexes.has(index)) return;
      if (team && participant.team !== team) return;

      const score = simpleMatchScore(playerName, participant.playerInput);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { index, score };
      }
    });

    return bestMatch;
  };

  const getSequentialParticipantFallback = (
    participants: ParticipantForm[],
    usedIndexes: Set<number>,
    team?: Team | null,
    visualRowIndex?: number
  ): { index: number; score: number } | null => {
    const candidates = participants
      .map((participant, index) => ({ participant, index }))
      .filter(({ participant, index }) => {
        if (usedIndexes.has(index)) return false;
        if (team && participant.team !== team) return false;
        return Boolean(participant.playerInput.trim());
      });

    if (candidates.length === 0) return null;

    if (team && typeof visualRowIndex === "number" && visualRowIndex >= 0) {
      const byVisualOrder = candidates[visualRowIndex];
      if (byVisualOrder) {
        return { index: byVisualOrder.index, score: 0.2 };
      }
    }

    return { index: candidates[0].index, score: 0.15 };
  };

  const hasReadableKda = (row: LolResultImportRow) =>
    row.kills !== null && row.deaths !== null && row.assists !== null;

  const getMatchThreshold = (match: { index: number; score: number } | null) => {
    if (!match) return false;
    return match.score >= 0.14;
  };

  const getClipboardImageFiles = (event: ClipboardEvent<HTMLElement>) => {
    const items = Array.from(event.clipboardData.items ?? []);

    return items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item, index) => {
        const file = item.getAsFile();
        if (!file) return null;

        const extension = file.type.split("/")[1] || "png";
        return new File([file], file.name || `lol-result-${Date.now()}-${index}.${extension}`, {
          type: file.type,
        });
      })
      .filter((file): file is File => Boolean(file));
  };

  const handleImportLolResult = async (gameIndex: number, file: File | null) => {
    if (!file) return;

    const targetGame = form.games[gameIndex];
    if (!targetGame) return;

    const emptyPlayers = targetGame.participants.filter(
      (participant) => !participant.playerId || !participant.playerInput.trim()
    );

    if (emptyPlayers.length > 0) {
      alert("먼저 팀 밸런스 결과를 불러오거나 플레이어 10명을 입력해주세요.");
      return;
    }

    let timeoutId: number | null = null;
    let progressTimerId: number | null = null;

    try {
      setLolResultImportingGameIndex(gameIndex);
      setLolResultImportStatus((prev) => ({
        ...prev,
        [gameIndex]: "캡쳐 업로드 준비 중...",
      }));

      const body = new FormData();
      body.append("image", file);

      const controller = new AbortController();
      const startedAt = Date.now();
      timeoutId = window.setTimeout(() => controller.abort(), 90_000);
      progressTimerId = window.setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
        setLolResultImportStatus((prev) => ({
          ...prev,
          [gameIndex]: `서버 분석 중... ${elapsedSeconds}초 경과 · OCR/챔피언 비교 진행 중`,
        }));
      }, 1000);

      setLolResultImportStatus((prev) => ({
        ...prev,
        [gameIndex]: "서버 분석 요청 중... OCR/챔피언 비교를 시작합니다.",
      }));

      const response = await fetch("/api/matches/import-lol-result", {
        method: "POST",
        body,
        signal: controller.signal,
      });

      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (progressTimerId !== null) window.clearInterval(progressTimerId);

      setLolResultImportStatus((prev) => ({
        ...prev,
        [gameIndex]: "분석 결과를 폼에 적용 중...",
      }));

      const data = await parseResponse<LolResultImportResponse & { message?: string }>(
        response
      );

      if (!response.ok || !data) {
        alert(data?.message ?? "롤 결과 캡쳐 분석에 실패했습니다.");
        return;
      }

      const usedParticipantIndexes = new Set<number>();
      const championPreviewUpdates: Record<string, string> = {};

      const normalizedRows = data.rows.map((row, visualIndex) => ({
        ...row,
        visualIndex,
        hasKda: row.kills !== null && row.deaths !== null && row.assists !== null,
      }));

      const teamDetectCandidates = normalizedRows
        .filter((row) => row.side === "TOP" && row.playerName.trim())
        .map((row) => ({
          row,
          match: getBestParticipantMatch(
            targetGame.participants,
            row.playerName,
            new Set<number>()
          ),
        }))
        .filter((candidate): candidate is typeof candidate & { match: { index: number; score: number } } =>
          Boolean(candidate.match)
        )
        .sort((left, right) => right.match.score - left.match.score);

      const topPlayerMatch = teamDetectCandidates[0]?.match ?? null;
      const canDetectTeams = Boolean(topPlayerMatch && topPlayerMatch.score >= 0.22);
      const topImageTeam = canDetectTeams
        ? targetGame.participants[topPlayerMatch!.index].team
        : null;
      const bottomImageTeam: Team | null =
        topImageTeam === "BLUE" ? "RED" : topImageTeam === "RED" ? "BLUE" : null;

      let appliedCount = 0;
      let needsCheckCount = 0;
      const nextGames = [...form.games];
      const currentGame = nextGames[gameIndex];
      const nextParticipants = currentGame.participants.map((participant) => ({
        ...participant,
      }));

      const applyRowToParticipant = (
        row: typeof normalizedRows[number],
        match: { index: number; score: number },
        reason: string
      ) => {
        if (!row.hasKda) return false;
        if (usedParticipantIndexes.has(match.index)) return false;

        usedParticipantIndexes.add(match.index);
        const participant = nextParticipants[match.index];
        if (!participant) return false;

        participant.kills = row.kills ?? participant.kills;
        participant.deaths = row.deaths ?? participant.deaths;
        participant.assists = row.assists ?? participant.assists;

        const candidateKey = `${gameIndex}-${match.index}`;
        if (row.championPreviewDataUrl) {
          championPreviewUpdates[candidateKey] = row.championPreviewDataUrl;
        }

        appliedCount += 1;
        if (process.env.NODE_ENV !== "production") {
          console.info("[LOL_RESULT_IMPORT_MATCH_APPLY]", {
            reason,
            rowPlayerName: row.playerName,
            rowKda: { kills: row.kills, deaths: row.deaths, assists: row.assists },
            participantIndex: match.index,
            participant: participant.playerInput,
            score: match.score,
          });
        }
        return true;
      };

      // 1차: 이름/라이엇 닉네임 직접 매칭. 점수가 충분한 행만 먼저 적용한다.
      for (const row of normalizedRows) {
        if (!row.hasKda) {
          needsCheckCount += 1;
          continue;
        }

        const targetTeam = canDetectTeams
          ? row.side === "TOP"
            ? topImageTeam ?? undefined
            : bottomImageTeam ?? undefined
          : undefined;

        const teamMatch = targetTeam
          ? getBestParticipantMatch(nextParticipants, row.playerName, usedParticipantIndexes, targetTeam)
          : null;
        const anyMatch = getBestParticipantMatch(nextParticipants, row.playerName, usedParticipantIndexes);
        const preferredMatch = getMatchThreshold(teamMatch) ? teamMatch : getMatchThreshold(anyMatch) ? anyMatch : null;

        if (preferredMatch && applyRowToParticipant(row, preferredMatch, "name")) {
          continue;
        }

        if (process.env.NODE_ENV !== "production") {
          console.info("[LOL_RESULT_IMPORT_MATCH_PENDING]", {
            rowPlayerName: row.playerName,
            rowKda: { kills: row.kills, deaths: row.deaths, assists: row.assists },
            targetTeam,
            teamMatch,
            anyMatch,
          });
        }
      }

      // 2차: 같은 팀이 판별된 경우, 이름 인식이 무너진 행만 팀 내 남은 순서로 보조 적용한다.
      for (const row of normalizedRows) {
        if (!row.hasKda) continue;
        const alreadyApplied = Array.from(usedParticipantIndexes).some((index) => {
          const p = nextParticipants[index];
          return p?.kills === row.kills && p?.deaths === row.deaths && p?.assists === row.assists;
        });
        if (alreadyApplied) continue;

        const visualRowIndex = normalizedRows
          .filter((candidate) => candidate.side === row.side)
          .findIndex((candidate) => candidate === row);
        const targetTeam = canDetectTeams
          ? row.side === "TOP"
            ? topImageTeam ?? undefined
            : bottomImageTeam ?? undefined
          : undefined;

        const fallback = getSequentialParticipantFallback(
          nextParticipants,
          usedParticipantIndexes,
          targetTeam,
          visualRowIndex
        );

        if (fallback && fallback.score > 0 && applyRowToParticipant(row, fallback, "sequential")) {
          continue;
        }

        needsCheckCount += 1;
        if (process.env.NODE_ENV !== "production") {
          console.info("[LOL_RESULT_IMPORT_MATCH_SKIP]", {
            rowPlayerName: row.playerName,
            rowKda: { kills: row.kills, deaths: row.deaths, assists: row.assists },
            targetTeam,
            fallback,
          });
        }
      }

      // 챔피언은 수동 입력이지만, 캡쳐 아이콘은 항상 보이게 한다.
      // KDA 매칭이 실패한 행도 같은 팀/화면 순서 기준으로 미리보기 이미지를 배치한다.
      for (const row of normalizedRows) {
        if (!row.championPreviewDataUrl) continue;

        const alreadyShown = Object.values(championPreviewUpdates).includes(row.championPreviewDataUrl);
        if (alreadyShown) continue;

        const visualRowIndex = normalizedRows
          .filter((candidate) => candidate.side === row.side)
          .findIndex((candidate) => candidate === row);
        const targetTeam = canDetectTeams
          ? row.side === "TOP"
            ? topImageTeam ?? undefined
            : bottomImageTeam ?? undefined
          : undefined;

        const orderedTeamParticipants = nextParticipants
          .map((participant, index) => ({ participant, index }))
          .filter(({ participant }) => !targetTeam || participant.team === targetTeam);

        const fallbackIndex = orderedTeamParticipants[visualRowIndex]?.index;
        if (typeof fallbackIndex === "number") {
          const key = `${gameIndex}-${fallbackIndex}`;
          if (!championPreviewUpdates[key]) {
            championPreviewUpdates[key] = row.championPreviewDataUrl;
          }
        }
      }

      const resultText = (data.resultText ?? "").replace(/\s+/g, "");
      const resultTextForKorean = resultText.replace(/[^가-힣a-zA-Z]/g, "");
      const hasWinText =
        /승리|victory|win/i.test(resultText) || /승.*리/.test(resultTextForKorean);
      const hasLoseText =
        /패배|defeat|loss|lose/i.test(resultText) || /패.*배/.test(resultTextForKorean);

      const topKillSum = normalizedRows
        .filter((row) => row.side === "TOP" && row.hasKda)
        .reduce((sum, row) => sum + (row.kills ?? 0), 0);
      const bottomKillSum = normalizedRows
        .filter((row) => row.side === "BOTTOM" && row.hasKda)
        .reduce((sum, row) => sum + (row.kills ?? 0), 0);
      const topValidKdaCount = normalizedRows.filter(
        (row) => row.side === "TOP" && row.hasKda
      ).length;
      const bottomValidKdaCount = normalizedRows.filter(
        (row) => row.side === "BOTTOM" && row.hasKda
      ).length;

      let winnerTeam = currentGame.winnerTeam;
      let winnerDetectReason: "result-title-win" | "result-title-lose" | "team-kill-sum" | "not-detected" =
        "not-detected";

      if (canDetectTeams && topImageTeam && bottomImageTeam) {
        if (hasWinText) {
          // 롤 결과 화면에서 위쪽 팀은 현재 클라이언트 계정이 속한 팀입니다.
          winnerTeam = topImageTeam;
          winnerDetectReason = "result-title-win";
        } else if (hasLoseText) {
          winnerTeam = bottomImageTeam;
          winnerDetectReason = "result-title-lose";
        } else if (
          topValidKdaCount >= 3 &&
          bottomValidKdaCount >= 3 &&
          topKillSum !== bottomKillSum
        ) {
          // 승리/패배 OCR이 실패한 경우의 보조값입니다.
          // 일반적으로 결과 화면에서는 팀 킬이 높은 쪽이 승리팀인 경우가 대부분이므로 자동 선택하되,
          // 관리자가 저장 전 토글로 수정할 수 있게 유지합니다.
          winnerTeam = topKillSum > bottomKillSum ? topImageTeam : bottomImageTeam;
          winnerDetectReason = "team-kill-sum";
        }
      }

      if (process.env.NODE_ENV !== "production") {
        console.info("[LOL_RESULT_IMPORT_WINNER_DETECT]", {
          resultText,
          hasWinText,
          hasLoseText,
          topImageTeam,
          bottomImageTeam,
          topKillSum,
          bottomKillSum,
          topValidKdaCount,
          bottomValidKdaCount,
          winnerTeam,
          winnerDetectReason,
        });
      }

      nextGames[gameIndex] = {
        ...currentGame,
        winnerTeam,
        participants: nextParticipants,
      };

      setForm((prev) => ({
        ...prev,
        games: prev.games.map((game, index) =>
          index === gameIndex ? nextGames[gameIndex] : game
        ),
      }));

      setLolChampionCandidates((prev) => {
        const next = { ...prev };
        for (const participantIndex of targetGame.participants.keys()) {
          delete next[`${gameIndex}-${participantIndex}`];
        }
        return next;
      });
      setLolChampionPreviews((prev) => ({
        ...prev,
        ...championPreviewUpdates,
      }));

      const statusText =
        needsCheckCount > 0
          ? `${appliedCount}명 KDA 자동 입력, ${needsCheckCount}명 확인 필요`
          : `${appliedCount}명 KDA 자동 입력 완료`;

      setLolResultImportStatus((prev) => ({
        ...prev,
        [gameIndex]: statusText,
      }));
      alert(statusText);
    } catch (error) {
      console.error("[LOL_RESULT_IMPORT_CLIENT_ERROR]", error);

      const isAbortError =
        error instanceof DOMException && error.name === "AbortError";
      const message = isAbortError
        ? "90초 동안 응답이 없어 분석을 중단했습니다. 캡쳐 범위를 줄이거나 다시 시도해주세요."
        : "롤 결과 캡쳐 불러오기 중 오류가 발생했습니다.";

      setLolResultImportStatus((prev) => ({
        ...prev,
        [gameIndex]: message,
      }));
      alert(message);
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (progressTimerId !== null) window.clearInterval(progressTimerId);
      setLolResultImportingGameIndex(null);
    }
  };

  const handlePasteLolResults = async (
    gameIndex: number,
    event: ClipboardEvent<HTMLElement>
  ) => {
    const files = getClipboardImageFiles(event);

    if (files.length === 0) return;

    event.preventDefault();

    if (lolResultImportingGameIndex !== null) {
      alert("이미 캡쳐 분석이 진행 중입니다. 완료 후 다시 붙여넣어주세요.");
      return;
    }

    const availableGameCount = form.games.length - gameIndex;
    if (files.length > availableGameCount) {
      alert(`붙여넣은 캡쳐 ${files.length}장 중 ${availableGameCount}장만 적용할 수 있습니다. 세트를 먼저 추가해주세요.`);
      return;
    }

    for (const [offset, file] of files.entries()) {
      await handleImportLolResult(gameIndex + offset, file);
    }
  };

  const handleSubmit = async () => {
    try {
      const validationMessage = runClientValidation();

      if (validationMessage) {
        alert(validationMessage);
        return;
      }

      setSubmitting(true);

      const payload = buildPayload();
      const method = mode === "create" ? "POST" : "PATCH";

      const response = await fetch(submitUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await parseResponse<{ message?: string; id?: number }>(response);

      if (!response.ok) {
        alert(data?.message ?? "저장에 실패했습니다.");
        return;
      }

      alert(
        mode === "create"
          ? "내전이 등록되었습니다."
          : "내전이 수정되었습니다."
      );
      router.push("/admin/matches");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const getPlayerSuggestions = (
    gameIndex: number,
    keyword: string,
    currentPlayerId: number
  ): PlayerOption[] => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    const selectedPlayerIds = new Set<number>();
    form.games[gameIndex]?.participants.forEach((participant) => {
      if (participant.playerId && participant.playerId !== currentPlayerId) {
        selectedPlayerIds.add(participant.playerId);
      }
    });

    return players
      .filter((player) => {
        if (selectedPlayerIds.has(player.id)) {
          return false;
        }

        if (!normalizedKeyword) {
          return true;
        }

        return (
          player.name.toLowerCase().includes(normalizedKeyword) ||
          `${player.nickname}#${player.tag}`
            .toLowerCase()
            .includes(normalizedKeyword)
        );
      })
      .slice(0, 20);
  };

  const getChampionSuggestions = (
    gameIndex: number,
    keyword: string,
    currentChampionId: number
  ): ChampionOption[] => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    const selectedChampionIds = new Set<number>();
    form.games[gameIndex]?.participants.forEach((participant) => {
      if (
        participant.championId &&
        participant.championId !== currentChampionId
      ) {
        selectedChampionIds.add(participant.championId);
      }
    });

    return champions
      .filter((champion) => {
        if (selectedChampionIds.has(champion.id)) {
          return false;
        }

        if (!normalizedKeyword) {
          return true;
        }

        return champion.name.toLowerCase().includes(normalizedKeyword);
      })
      .slice(0, 20);
  };

  return (
    <main className="page-container">
      <h1 className="page-title">
        {mode === "create" ? "내전 등록" : "내전 수정"}
      </h1>

      <div className="match-form-base">
        <label className="match-form-field">
          <span>제목</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, title: e.target.value }))
            }
          />
        </label>

        <label className="match-form-field">
          <span>시즌</span>
          <select
            value={form.seasonId}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                seasonId: Number(e.target.value),
              }))
            }
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="match-form-actions" style={{ marginBottom: "24px" }}>
        <button
          type="button"
          className="app-button--danger-outline"
          onClick={addGame}
        >
          세트 추가
        </button>

        {mode === "create" ? (
          <div
            className="match-team-balance-import"
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <select
              className="match-form-select"
              value={selectedTeamBalanceDraftId}
              onChange={(event) => setSelectedTeamBalanceDraftId(event.target.value)}
              disabled={draftListLoading || importLoading || teamBalanceDrafts.length === 0}
              style={{
                minWidth: "260px",
                height: "40px",
              }}
            >
              <option value="">
                {teamBalanceDrafts.length === 0
                  ? "최근 3일 이내 저장 결과 없음"
                  : "팀 밸런스 결과 선택"}
              </option>

              {teamBalanceDrafts.map((draft) => (
                <option key={draft.id} value={String(draft.id)}>
                  {draft.label} · {draft.count}명
                </option>
              ))}
            </select>

            <button
              type="button"
              className="app-button--danger-outline"
              onClick={() => {
                handleImportTeamBalance().catch((error: unknown) => {
                  console.error("[IMPORT_TEAM_BALANCE_PROMISE_ERROR]", error);
                });
              }}
              disabled={draftListLoading || importLoading || teamBalanceDrafts.length === 0}
            >
              {importLoading ? "불러오는 중..." : "팀 밸런스 불러오기"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="card-grid">
        {form.games.map((game, gameIndex) => (
          <section key={game.gameNumber} className="match-form-game">
            <div className="match-form-game__top">
              <div>
                <h2 className="match-form-game__title">세트 {game.gameNumber}</h2>
              </div>

              <div className="match-form-game__controls">
                <div
                  className={`app-button--danger-outline match-lol-result-import-button ${
                    lolResultImportingGameIndex === gameIndex
                      ? "match-lol-result-import-button--loading"
                      : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-disabled={lolResultImportingGameIndex !== null}
                  title="Windows + Shift + S로 캡쳐 후 이 영역을 클릭하고 Ctrl + V를 누르세요. 여러 장을 붙여넣으면 현재 세트부터 순서대로 적용됩니다."
                  onPaste={(event) => {
                    void handlePasteLolResults(gameIndex, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.currentTarget.focus();
                    }
                  }}
                >
                  {lolResultImportingGameIndex === gameIndex
                    ? "캡쳐 분석 중..."
                    : "Ctrl + V로 롤 결과 붙여넣기"}
                  <span className="match-lol-result-import-button__hint">
                    Win+Shift+S 후 클릭 → Ctrl+V
                  </span>
                </div>

                <div className="match-winner-toggle">
                  <span className="match-winner-toggle__label">승리팀</span>

                  <button
                    type="button"
                    className={`match-winner-button match-winner-button--blue ${
                      game.winnerTeam === "BLUE"
                        ? "match-winner-button--selected"
                        : ""
                    }`}
                    aria-pressed={game.winnerTeam === "BLUE"}
                    onClick={() => updateGameWinnerTeam(gameIndex, "BLUE")}
                  >
                    BLUE
                  </button>

                  <button
                    type="button"
                    className={`match-winner-button match-winner-button--red ${
                      game.winnerTeam === "RED"
                        ? "match-winner-button--selected"
                        : ""
                    }`}
                    aria-pressed={game.winnerTeam === "RED"}
                    onClick={() => updateGameWinnerTeam(gameIndex, "RED")}
                  >
                    RED
                  </button>
                </div>

                <button
                  type="button"
                  className="app-button--danger-outline"
                  onClick={() => removeGame(gameIndex)}
                >
                  세트 삭제
                </button>
              </div>
            </div>

            {lolResultImportStatus[gameIndex] ? (
              <div className="match-lol-result-import-status">
                {lolResultImportStatus[gameIndex]}
              </div>
            ) : null}

            <div className="match-entry-board">
              <div className="match-entry-header">
                <div>팀</div>
                <div>라인</div>
                <div>플레이어</div>
                <div>챔피언</div>
                <div>킬</div>
                <div>데스</div>
                <div>어시스트</div>
              </div>

              {game.participants.map((participant, participantIndex) => {
                const playerFieldKey = `player-${gameIndex}-${participantIndex}`;
                const championFieldKey = `champion-${gameIndex}-${participantIndex}`;

                const playerSuggestions =
                  activePlayerField === playerFieldKey
                    ? getPlayerSuggestions(
                        gameIndex,
                        participant.playerInput,
                        participant.playerId
                      )
                    : [];

                const championSuggestions =
                  activeChampionField === championFieldKey
                    ? getChampionSuggestions(
                        gameIndex,
                        participant.championInput,
                        participant.championId
                      )
                    : [];

                const importChampionPreview =
                  lolChampionPreviews[`${gameIndex}-${participantIndex}`] ?? "";

                return (
                  <div
                    key={`${participant.team}-${participant.position}-${participantIndex}`}
                    className="match-participant-row"
                  >
                    <div
                      className={`match-team-badge ${
                        participant.team === "BLUE"
                          ? "match-team-badge--blue"
                          : "match-team-badge--red"
                      }`}
                    >
                      {participant.team}
                    </div>

                    <div className="match-position-cell">
                      {participant.position}
                    </div>

                    <div className="match-autocomplete-cell">
                      <input
                        value={participant.playerInput}
                        onFocus={() => setActivePlayerField(playerFieldKey)}
                        onChange={(e) => {
                          const value = e.target.value;

                          updateParticipantField(
                            gameIndex,
                            participantIndex,
                            "playerInput",
                            value
                          );
                          updateParticipantField(
                            gameIndex,
                            participantIndex,
                            "playerId",
                            0
                          );
                          setActivePlayerField(playerFieldKey);
                        }}
                        onBlur={() => {
                          setTimeout(() => setActivePlayerField(null), 150);
                        }}
                        className="match-grid-input"
                        placeholder="플레이어 이름 검색"
                        autoComplete="off"
                      />

                      {activePlayerField === playerFieldKey &&
                        playerSuggestions.length > 0 && (
                          <div className="match-autocomplete-list">
                            {playerSuggestions.map((player) => (
                              <button
                                key={player.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  updateParticipantField(
                                    gameIndex,
                                    participantIndex,
                                    "playerInput",
                                    makePlayerLabel(player)
                                  );
                                  updateParticipantField(
                                    gameIndex,
                                    participantIndex,
                                    "playerId",
                                    player.id
                                  );
                                  setActivePlayerField(null);
                                }}
                                className="match-autocomplete-item"
                              >
                                {makePlayerLabel(player)}
                              </button>
                            ))}
                          </div>
                        )}
                    </div>

                    <div className="match-autocomplete-cell">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                        }}
                      >
                        {importChampionPreview ? (
                          <img
                            src={importChampionPreview}
                            alt=""
                            width={38}
                            height={38}
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: "50%",
                              border: "1px solid rgba(56, 189, 248, 0.7)",
                              boxShadow: "0 0 0 2px rgba(15, 23, 42, 0.9)",
                              objectFit: "cover",
                              background: "#020617",
                              flex: "0 0 auto",
                            }}
                          />
                        ) : (
                          <div
                            aria-hidden="true"
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: "50%",
                              border: "1px solid rgba(148, 163, 184, 0.18)",
                              background: "rgba(2, 6, 23, 0.55)",
                              flex: "0 0 auto",
                            }}
                          />
                        )}

                        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                          <input
                            value={participant.championInput}
                            onFocus={() => setActiveChampionField(championFieldKey)}
                            onChange={(e) => {
                              const value = e.target.value;

                              updateParticipantField(
                                gameIndex,
                                participantIndex,
                                "championInput",
                                value
                              );
                              updateParticipantField(
                                gameIndex,
                                participantIndex,
                                "championId",
                                championMap.get(value.trim().toLowerCase()) ?? 0
                              );
                              setActiveChampionField(championFieldKey);
                            }}
                            onBlur={() => {
                              setTimeout(() => setActiveChampionField(null), 150);
                            }}
                            className="match-grid-input"
                            placeholder="챔피언 입력"
                            autoComplete="off"
                          />

                          {activeChampionField === championFieldKey &&
                            championSuggestions.length > 0 && (
                              <div className="match-autocomplete-list">
                                {championSuggestions.map((champion) => (
                                  <button
                                    key={champion.id}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      updateParticipantField(
                                        gameIndex,
                                        participantIndex,
                                        "championInput",
                                        champion.name
                                      );
                                      updateParticipantField(
                                        gameIndex,
                                        participantIndex,
                                        "championId",
                                        champion.id
                                      );
                                      setActiveChampionField(null);
                                    }}
                                    className="match-autocomplete-item"
                                  >
                                    {champion.name}
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={participant.kills}
                        onChange={(e) =>
                          updateParticipantField(
                            gameIndex,
                            participantIndex,
                            "kills",
                            parseNonNegativeInt(e.target.value)
                          )
                        }
                        className="match-grid-input"
                      />
                    </div>

                    <div>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={participant.deaths}
                        onChange={(e) =>
                          updateParticipantField(
                            gameIndex,
                            participantIndex,
                            "deaths",
                            parseNonNegativeInt(e.target.value)
                          )
                        }
                        className="match-grid-input"
                      />
                    </div>

                    <div>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={participant.assists}
                        onChange={(e) =>
                          updateParticipantField(
                            gameIndex,
                            participantIndex,
                            "assists",
                            parseNonNegativeInt(e.target.value)
                          )
                        }
                        className="match-grid-input"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="match-form-actions">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="app-button"
          style={{ opacity: submitting ? 0.6 : 1 }}
        >
          {submitting
            ? mode === "create"
              ? "등록 중..."
              : "수정 중..."
            : mode === "create"
            ? "내전 등록"
            : "내전 수정"}
        </button>
      </div>

      <style jsx global>{`
        .match-form-game__controls {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .match-lol-result-import-button {
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          min-height: 34px !important;
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
        }

        .match-lol-result-import-button--loading {
          opacity: 0.62;
          pointer-events: none;
        }

        .match-lol-result-import-status {
          margin: 10px 0 12px;
          padding: 9px 12px;
          border-radius: 12px;
          border: 1px solid rgba(56, 189, 248, 0.32);
          background: rgba(8, 47, 73, 0.34);
          color: #bae6fd;
          font-size: 12px;
          font-weight: 800;
        }

        .match-winner-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.68);
          border: 1px solid rgba(148, 163, 184, 0.28);
        }

        .match-winner-toggle__label {
          padding: 0 4px 0 8px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .match-winner-button {
          min-width: 70px !important;
          height: 30px !important;
          min-height: 30px !important;
          padding: 0 10px !important;
          border-radius: 999px !important;
          border: 1px solid rgba(148, 163, 184, 0.36) !important;
          background: rgba(2, 6, 23, 0.68) !important;
          color: #cbd5e1 !important;
          font-size: 12px !important;
          font-weight: 900 !important;
          cursor: pointer;
          box-shadow: none !important;
          transform: none !important;
          transition: all 0.15s ease !important;
        }

        .match-winner-button:hover {
          border-color: rgba(226, 232, 240, 0.64) !important;
          background: rgba(15, 23, 42, 0.92) !important;
          color: #ffffff !important;
          box-shadow: none !important;
          transform: none !important;
        }

        .match-winner-button--blue.match-winner-button--selected {
          border-color: rgba(96, 165, 250, 0.95) !important;
          background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
          color: #ffffff !important;
          box-shadow: 0 0 14px rgba(37, 99, 235, 0.44) !important;
        }

        .match-winner-button--red.match-winner-button--selected {
          border-color: rgba(248, 113, 113, 0.95) !important;
          background: linear-gradient(135deg, #dc2626, #991b1b) !important;
          color: #ffffff !important;
          box-shadow: 0 0 14px rgba(220, 38, 38, 0.42) !important;
        }

        @media (max-width: 720px) {
          .match-form-game__controls {
            justify-content: flex-start;
          }

          .match-winner-toggle {
            width: 100%;
            justify-content: space-between;
          }

          .match-winner-button {
            flex: 1;
          }
        }
      `}</style>

    </main>
  );
}