"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type AppTopBarProps = {
  title: string;
  homeHref: string;
  mode: "user" | "admin";
};

type TopBarUser = {
  userId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

export default function AppTopBar({
  title,
  homeHref,
  mode,
}: AppTopBarProps) {
  const router = useRouter();
  const [menu, setMenu] = useState<"players" | "matches">("players");
  const [keyword, setKeyword] = useState("");
  const [user, setUser] = useState<TopBarUser | null>(null);

  useEffect(() => {
    if (mode !== "user") {
      return;
    }

    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (!res.ok) {
          setUser(null);
          return;
        }

        const data: { user: TopBarUser | null } = await res.json();
        setUser(data.user ?? null);
      } catch (error: unknown) {
        console.error("[APP_TOPBAR_AUTH_ERROR]", error);
        setUser(null);
      }
    }

    fetchUser().catch((error: unknown) => {
      console.error("[APP_TOPBAR_AUTH_PROMISE_ERROR]", error);
      setUser(null);
    });
  }, [mode]);

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
          ? `/admin/`
          : "/admin/"
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

      {mode === "user" ? (
        <div className="app-topbar__mobile-auth" aria-label="모바일 회원 메뉴">
          {user ? (
            <Link href="/me/player" className="app-topbar__auth-link app-topbar__auth-link--primary">
              내 정보
            </Link>
          ) : (
            <>
              <Link href="/login" className="app-topbar__auth-link">
                로그인
              </Link>
              <Link href="/signup" className="app-topbar__auth-link app-topbar__auth-link--primary">
                회원가입
              </Link>
            </>
          )}
        </div>
      ) : null}

      <form className="app-topbar__search" onSubmit={handleSubmit}>
        <select
          className="app-select"
          value={menu}
          onChange={(e) => setMenu(e.target.value as "players" | "matches")}
        >
          <option value="players">
            {mode === "admin" ? "플레이어" : "플레이어"}
          </option>
          <option value="matches">
            {mode === "admin" ? "내전" : "내전"}
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