"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type UserStatus = "PENDING" | "APPROVED" | "REJECTED";

type User = {
  userId: string;
  status: UserStatus;
};

export default function AuthSection() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (!res.ok) {
          setUser(null);
          return;
        }

        const data: { user: User | null } = await res.json();
        setUser(data.user ?? null);
      } catch (error: unknown) {
        console.error("[AUTH_SECTION_FETCH_ERROR]", error);
        setUser(null);
      }
    }

    fetchUser().catch((error: unknown) => {
      console.error("[AUTH_SECTION_FETCH_PROMISE_ERROR]", error);
      setUser(null);
    });
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });

      window.location.href = "/";
    } catch (error: unknown) {
      console.error("[AUTH_SECTION_LOGOUT_ERROR]", error);
      alert("로그아웃 중 오류가 발생했습니다.");
    }
  };

  if (!user) {
    return (
      <div className="sidebar-auth">
        <Link href="/login" className="sidebar-auth__button">
          로그인
        </Link>

        <Link href="/signup" className="sidebar-auth__button secondary">
          회원가입
        </Link>
      </div>
    );
  }

  return (
    <div className="sidebar-auth">
      <div className="sidebar-auth__user">
        {user.userId}

        {user.status === "PENDING" ? (
          <span className="sidebar-auth__pending">승인대기</span>
        ) : null}

        {user.status === "REJECTED" ? (
          <span className="sidebar-auth__rejected">거절됨</span>
        ) : null}
      </div>

      {user.status === "APPROVED" ? (
        <Link href="/me/player" className="sidebar-auth__button">
          내 정보
        </Link>
      ) : null}

      <button
        type="button"
        className="sidebar-auth__button danger"
        onClick={() => {
          handleLogout().catch((error: unknown) => {
            console.error("[AUTH_SECTION_LOGOUT_PROMISE_ERROR]", error);
          });
        }}
      >
        로그아웃
      </button>
    </div>
  );
}