"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type AppTopBarProps = {
  title: string;
  homeHref: string;
  mode: "user" | "admin";
};

export default function AppTopBar({
  title,
  homeHref,
  mode,
}: AppTopBarProps) {
  const router = useRouter();
  const [menu, setMenu] = useState<"players" | "matches">("players");
  const [keyword, setKeyword] = useState("");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const q = keyword.trim();

    if (mode === "admin") {
      if (menu === "players") {
        router.push(
          q
            ? `/admin/players?q=${encodeURIComponent(q)}`
            : "/admin/players"
        );
        return;
      }

      router.push(
        q
          ? `/admin/matches?q=${encodeURIComponent(q)}`
          : "/admin/matches"
      );
      return;
    }

    if (menu === "players") {
      router.push(q ? `/players?q=${encodeURIComponent(q)}` : "/players");
      return;
    }

    router.push(q ? `/matches?q=${encodeURIComponent(q)}` : "/matches");
  };

  return (
    <header className="app-topbar">
      <div className="app-topbar__left">
        <Link href={homeHref} className="app-topbar__home">
          K-LOL.GG
        </Link>

        <span className="app-topbar__divider">|</span>

        <span className="app-topbar__title">{title}</span>
      </div>

      <form className="app-topbar__search" onSubmit={handleSubmit}>
        <select
          className="app-select"
          value={menu}
          onChange={(e) => setMenu(e.target.value as "players" | "matches")}
        >
          <option value="players">
            {mode === "admin" ? "관리자 플레이어" : "플레이어"}
          </option>
          <option value="matches">
            {mode === "admin" ? "관리자 내전" : "내전"}
          </option>
        </select>

        <input
          className="app-input"
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="검색"
        />

        <button className="app-button" type="submit">
          검색
        </button>
      </form>
    </header>
  );
}