"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  participants: ParticipantForm[];
};

type MatchFormData = {
  id?: number;
  seasonId: number;
  title: string;
  matchDate: string;
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
  const [activePlayerField, setActivePlayerField] = useState<string | null>(null);
  const [activeChampionField, setActiveChampionField] = useState<string | null>(
    null
  );

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

  const addGame = () => {
    setForm((prev) => {
      const nextGameNumber = prev.games.length + 1;
      const lastGame = prev.games[prev.games.length - 1];

      const nextGame: GameForm = lastGame
        ? {
            gameNumber: nextGameNumber,
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
      matchDate: form.matchDate,
      games: form.games.map((game) => ({
        gameNumber: game.gameNumber,
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

    if (!form.matchDate) {
      return "내전 일시를 입력해주세요.";
    }

    if (Number.isNaN(new Date(form.matchDate).getTime())) {
      return "내전 일시 형식이 올바르지 않습니다.";
    }

    if (form.games.length === 0) {
      return "최소 1세트 이상 추가해주세요.";
    }

    for (const game of form.games) {
      const gameLabel = `${game.gameNumber}세트`;

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

      const data = await response.json();

      if (!response.ok) {
        alert(data.message ?? "저장에 실패했습니다.");
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

        <label className="match-form-field">
          <span>일시</span>
          <input
            type="datetime-local"
            value={form.matchDate}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, matchDate: e.target.value }))
            }
          />
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
      </div>

      <div className="card-grid">
        {form.games.map((game, gameIndex) => (
          <section key={game.gameNumber} className="match-form-game">
            <div className="match-form-game__top">
              <div>
                <h2 className="match-form-game__title">세트 {game.gameNumber}</h2>
              </div>

              <div className="match-form-game__controls">
                <button
                  type="button"
                  className="app-button--danger-outline"
                  onClick={() => removeGame(gameIndex)}
                >
                  세트 삭제
                </button>
              </div>
            </div>

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

                    <div style={{ position: "relative" }}>
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
                          <div
                            style={{
                              position: "absolute",
                              top: "calc(100% + 4px)",
                              left: 0,
                              right: 0,
                              background: "#111",
                              border: "1px solid #333",
                              borderRadius: "8px",
                              maxHeight: "220px",
                              overflowY: "auto",
                              zIndex: 20,
                            }}
                          >
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
                                style={{
                                  display: "block",
                                  width: "100%",
                                  padding: "10px 12px",
                                  textAlign: "left",
                                  background: "transparent",
                                  border: "none",
                                  color: "#fff",
                                  cursor: "pointer",
                                }}
                              >
                                {makePlayerLabel(player)}
                              </button>
                            ))}
                          </div>
                        )}
                    </div>

                    <div style={{ position: "relative" }}>
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
                          <div
                            style={{
                              position: "absolute",
                              top: "calc(100% + 4px)",
                              left: 0,
                              right: 0,
                              background: "#111",
                              border: "1px solid #333",
                              borderRadius: "8px",
                              maxHeight: "220px",
                              overflowY: "auto",
                              zIndex: 20,
                            }}
                          >
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
                                style={{
                                  display: "block",
                                  width: "100%",
                                  padding: "10px 12px",
                                  textAlign: "left",
                                  background: "transparent",
                                  border: "none",
                                  color: "#fff",
                                  cursor: "pointer",
                                }}
                              >
                                {champion.name}
                              </button>
                            ))}
                          </div>
                        )}
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
    </main>
  );
}