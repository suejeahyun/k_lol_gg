"use client";

import { useEffect, useState } from "react";
import type { Overview } from "./_DiscordOverviewTypes";

export function useDiscordOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/discord/overview", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Discord 운영 현황 조회 실패");
    setData(json);
    setLoading(false);
  }
  useEffect(() => { void load().catch((error) => { console.error(error); setLoading(false); }); }, []);
  return { data, loading, load, setData };
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function secondsToText(value: number) {
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    ASSEMBLED: "모임 완료",
    ASSEMBLED_WITH_EXTRA: "모임 완료+외부",
    GATHERING: "진행 확인",
    PARTIAL_ACTIVE: "부분 진행",
    PARTIAL_ACTIVE_WITH_EXTRA: "부분 진행+구경",
    WAITING: "대기",
    RECRUIT_NOT_FULL: "대기",
    DISCORD_LINK_INCOMPLETE: "이름 확인 필요",
    FINISH_CANDIDATE: "ㅉ 후보",
    AUTO_FINISHED: "자동 ㅉ 완료",
    ACTIVE: "감시 중",
  };
  return map[status] || status;
}

export function attendanceStatusLabel(status: string) {
  const map: Record<string, string> = { PRESENT: "참석", LATE: "늦참", ABSENT_WARNING: "미접속 경고", WAITING: "대기" };
  return map[status] || status;
}

export function matchTypeLabel(type: string) {
  const map: Record<string, string> = { DISCORD_ID: "ID 확인", NAME_TOKEN: "이름 확인", NAME_AMBIGUOUS: "동명이인", OTHER_CHANNEL: "다른 방", NOT_MATCHED: "미확인" };
  return map[type] || type;
}

export function userLabel(event: Overview["currentVoiceUsers"][number]) {
  if (event.userAccount) {
    const player = event.userAccount.player;
    return player ? `${player.name || "-"} / ${player.nickname}#${player.tag}` : event.userAccount.userId;
  }
  return event.memberDisplayName || event.memberNickname || event.discordGlobalName || event.discordUsername || `Discord ${event.discordId.slice(-4)}`;
}
