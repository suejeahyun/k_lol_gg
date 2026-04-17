"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Team = "BLUE" | "RED";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

export type SeasonOption = {
  id: number;
  name: string;
};

export type PlayerOption = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
};

export type ChampionOption = {
  id: number;
  name: string;
};

export type ParticipantForm = {
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

export type GameForm = {
  gameNumber: number;
  durationMin: number;
  winnerTeam: Team;
  participants: ParticipantForm[];
};

export type MatchFormData = {
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