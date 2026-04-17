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
  cs: number;
  gold: number;
};

type GameForm = {
  gameNumber: number;
  durationMin: number;
  winnerTeam: Team;
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
  return `${player.name} (${player.nickname}#${player.tag})`;
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
      cs: 0,
      gold: 0,
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
      cs: 0,
      gold: 0,
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
      cs: 0,
      gold: 0,
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
      cs: 0,
      gold: 0,
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
      cs: 0,
      gold: 0,
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
      cs: 0,
      gold: 0,
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
      cs: 0,
      gold: 0,
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
      cs: 0,
      gold: 0,
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
      cs: 0,
      gold: 0,
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
      cs: 0,
      gold: 0,
    },
  ];
}

function createEmptyGame(nextGameNumber: number): GameForm {
  return {
    gameNumber: nextGameNumber,
    durationMin: 0,
    winnerTeam: "BLUE",
    participants: createEmptyParticipants(),
  };
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

  const playerMap = useMemo(() => {
    const map = new Map<string, number>();
    players.forEach((player) => {
      map.set(makePlayerLabel(player), player.id);
    });
    return map;
  }, [players]);

  const championMap = useMemo(() => {
    const map = new Map<string, number>();
    champions.forEach((champion) => {
      map.set(champion.name, champion.id);
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

  const updateGameField = <K extends keyof GameForm>(
    gameIndex: number,
    field: K,
    value: GameForm[K]
  ) => {
    setForm((prev) => {
      const nextGames = [...prev.games];
      nextGames[gameIndex] = {
        ...nextGames[gameIndex],
        [field]: value,
      };
      return { ...prev, games: nextGames };
    });
  };

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
    setForm((prev) => ({
      ...prev,
      games: [...prev.games, createEmptyGame(prev.games.length + 1)],
    }));
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
      title: form.title,
      matchDate: form.matchDate,
      games: form.games.map((game) => ({
        gameNumber: game.gameNumber,
        durationMin: game.durationMin,
        winnerTeam: game.winnerTeam,
        participants: game.participants.map((participant) => {
          const playerId =
            playerMap.get(participant.playerInput.trim()) ?? participant.playerId;
          const championId =
            championMap.get(participant.championInput.trim()) ??
            participant.championId;

          return {
            playerId,
            championId,
            team: participant.team,
            position: participant.position,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            cs: participant.cs,
            gold: participant.gold,
          };
        }),
      })),
    };
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);

      const payload = buildPayload();

      const hasInvalidPlayer = payload.games.some((game) =>
        game.participants.some((participant) => !participant.playerId)
      );
      if (hasInvalidPlayer) {
        alert("플레이어 입력값 중 자동완성 목록과 일치하지 않는 값이 있습니다.");
        return;
      }

      const hasInvalidChampion = payload.games.some((game) =>
        game.participants.some((participant) => !participant.championId)
      );
      if (hasInvalidChampion) {
        alert("챔피언 입력값 중 자동완성 목록과 일치하지 않는 값이 있습니다.");
        return;
      }

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

      alert(mode === "create" ? "내전이 등록되었습니다." : "내전이 수정되었습니다.");
      router.push("/admin/matches");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-container">
      <datalist id="player-options">
        {players.map((player) => {
          const label = makePlayerLabel(player);
          return <option key={player.id} value={label} />;
        })}
      </datalist>

      <datalist id="champion-options">
        {champions.map((champion) => (
          <option key={champion.id} value={champion.name} />
        ))}
      </datalist>

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
                <label className="match-form-inline-field">
                  <span>승리팀</span>
                  <select
                    value={game.winnerTeam}
                    onChange={(e) =>
                      updateGameField(
                        gameIndex,
                        "winnerTeam",
                        e.target.value as Team
                      )
                    }
                  >
                    <option value="BLUE">BLUE</option>
                    <option value="RED">RED</option>
                  </select>
                </label>

                <label className="match-form-inline-field">
                  <span>시간(분)</span>
                  <input
                    type="number"
                    value={game.durationMin}
                    onChange={(e) =>
                      updateGameField(
                        gameIndex,
                        "durationMin",
                        Number(e.target.value)
                      )
                    }
                  />
                </label>

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
                <div>CS</div>
                <div>골드</div>
              </div>

              {game.participants.map((participant, participantIndex) => (
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

                  <div className="match-position-cell">{participant.position}</div>

                  <div>
                    <input
                      list="player-options"
                      value={participant.playerInput}
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
                          playerMap.get(value.trim()) ?? 0
                        );
                      }}
                      className="match-grid-input"
                      placeholder="플레이어 입력"
                    />
                  </div>

                  <div>
                    <input
                      list="champion-options"
                      value={participant.championInput}
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
                          championMap.get(value.trim()) ?? 0
                        );
                      }}
                      className="match-grid-input"
                      placeholder="챔피언 입력"
                    />
                  </div>

                  <div>
                    <input
                      type="number"
                      value={participant.kills}
                      onChange={(e) =>
                        updateParticipantField(
                          gameIndex,
                          participantIndex,
                          "kills",
                          Number(e.target.value)
                        )
                      }
                      className="match-grid-input"
                    />
                  </div>

                  <div>
                    <input
                      type="number"
                      value={participant.deaths}
                      onChange={(e) =>
                        updateParticipantField(
                          gameIndex,
                          participantIndex,
                          "deaths",
                          Number(e.target.value)
                        )
                      }
                      className="match-grid-input"
                    />
                  </div>

                  <div>
                    <input
                      type="number"
                      value={participant.assists}
                      onChange={(e) =>
                        updateParticipantField(
                          gameIndex,
                          participantIndex,
                          "assists",
                          Number(e.target.value)
                        )
                      }
                      className="match-grid-input"
                    />
                  </div>

                  <div>
                    <input
                      type="number"
                      value={participant.cs}
                      onChange={(e) =>
                        updateParticipantField(
                          gameIndex,
                          participantIndex,
                          "cs",
                          Number(e.target.value)
                        )
                      }
                      className="match-grid-input"
                    />
                  </div>

                  <div>
                    <input
                      type="number"
                      value={participant.gold}
                      onChange={(e) =>
                        updateParticipantField(
                          gameIndex,
                          participantIndex,
                          "gold",
                          Number(e.target.value)
                        )
                      }
                      className="match-grid-input"
                    />
                  </div>
                </div>
              ))}
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